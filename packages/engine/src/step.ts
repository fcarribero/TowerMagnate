import type {
  Command,
  CommandResult,
  CommandType,
  EngineEvent,
  ErrorCode,
  QueuedCommand,
  TowerState,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import { towerCommandHandlers } from './commands';
import { rollBasementTreasure } from './events/treasure';
import { createElevatorSystem } from './elevators';
import { eventsPhase, vipBookingHook } from './events';
import { createCondoSystem } from './condos';
import { createCustomers } from './customers';
import { createHotelSystem } from './hotel';
import { createHotelGuests } from './hotel-guests';
import { isLayoutCommand } from './layout-changes';
import { createMaidSystem, maidArrivalHook, maidLeaveHook } from './housekeeping';
import { createLeaseSystem } from './leases';
import { parkingAssignmentHook } from './parking';
import { recordNotices } from './notices';
import { cloneState } from './state';
import { endStepCopy, stepCopy } from './step-copy';
import { ledgerWeekRollHook } from './money';
import { createOfficeRoutine } from './office-routine';
import { createResidentRoutine } from './resident-routine';
import { createProspectDemand } from './prospects';
import { createScheduler } from './scheduler';
import { cancelTrek, createTrekSystem, isOnTrek, plannedTripSteps } from './trek';
import { createNightReset } from './trip-ledger';
import { createDailyGradeSystem, storedGrade } from './unit-evaluation';
import {
  graphInputsMatch,
  graphInputsOf,
  TransportGraph,
  type GraphInputs,
  type ShaftStops,
} from './routing';
import { starCheckHook } from './stars';
import { weeklyUpkeepHook } from './upkeep';
import { weddingAttemptHook, weddingSystem } from './wedding';
import { venuePayoutHooks } from './venues';

export interface StepResult {
  state: TowerState;
  results: CommandResult[];
  events: EngineEvent[];
  /** Rebuilt after build, resize, demolish and stop commands, never inside the step loop. */
  graph: TransportGraph;
}

/** Working copy of the tower that handlers and systems may mutate, plus the events so far. */
export interface StepContext {
  state: TowerState;
  events: EngineEvent[];
  /** The graph of the tower for this step; systems that need one build it when it is missing. */
  graph?: TransportGraph;
}

/** What a command handler may change: only the working copy of the tower. */
export interface CommandContext {
  state: TowerState;
}

type WithoutCommandStamp<E> = E extends EngineEvent ? Omit<E, 'step' | 'commandId'> : never;

/** An event a command handler reports; the pipeline adds the step and the command id. */
export type CommandEvent = WithoutCommandStamp<Extract<EngineEvent, { commandId: string }>>;

export type CommandOutcome =
  | { ok: true; cost: number; refund: number; events: CommandEvent[] }
  | { ok: false; error: ErrorCode };

/**
 * Applies one command to the working state, or rejects it. Commands reach the engine from the
 * network, so a handler checks the shape of every field before trusting it.
 */
export type CommandHandler<K extends CommandType> = (
  context: CommandContext,
  command: Extract<Command, { type: K }>,
) => CommandOutcome;

export type CommandHandlers = { [K in CommandType]?: CommandHandler<K> };

/** Runs once per simulation step, after the step counter has advanced. */
export type SimulationSystem = (context: StepContext) => void;

function shaftStops(state: TowerState): ShaftStops {
  return new Map(Object.values(state.shafts).map((shaft) => [shaft.id, shaft.stops]));
}

export interface EngineRules {
  commandHandlers: CommandHandlers;
  systems: readonly SimulationSystem[];
}

export interface Engine {
  step(
    state: TowerState,
    commands: readonly QueuedCommand[],
    steps: number,
    graph?: TransportGraph,
  ): StepResult;
  runDays(state: TowerState, days: number): StepResult;
}

type AnyCommandHandler = (context: CommandContext, command: Command) => CommandOutcome;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNonNegativeInteger(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer, got ${value}`);
  }
}

function commandTypeOf(queued: QueuedCommand | undefined): string {
  return isRecord(queued?.command) ? String(queued.command.type) : '';
}

export function createEngine(rules: EngineRules): Engine {
  /**
   * The graph of each state this engine returned, so stepping on from it keeps the planner's
   * caches. The inputs catch a state changed in place after it was returned.
   */
  const graphsByState = new WeakMap<TowerState, { graph: TransportGraph; inputs: GraphInputs }>();

  /** The graph kept for `state` if its inputs did not change, and those inputs. */
  function graphKeptFor(state: TowerState): { graph?: TransportGraph; inputs: GraphInputs | null } {
    const kept = graphsByState.get(state);
    if (!kept || !graphInputsMatch(state, kept.inputs)) return { inputs: null };
    return { graph: kept.graph, inputs: kept.inputs };
  }

  /**
   * Systems never change what the graph is built from, only commands and ruins do, so a step
   * call without either keeps the inputs it started with.
   */
  function graphInputsAfter(
    before: TowerState,
    after: TowerState,
    inputsBefore: GraphInputs | null,
    results: readonly CommandResult[],
  ): GraphInputs {
    const unchanged = after.grid === before.grid && results.every((result) => !result.ok);
    return unchanged && inputsBefore !== null ? inputsBefore : graphInputsOf(after);
  }

  function handlerFor(command: unknown): AnyCommandHandler | undefined {
    if (!isRecord(command) || typeof command.type !== 'string') {
      return undefined;
    }
    if (!Object.hasOwn(rules.commandHandlers, command.type)) {
      return undefined;
    }
    return rules.commandHandlers[command.type as CommandType] as AnyCommandHandler | undefined;
  }

  function applyCommand(context: StepContext, queued: QueuedCommand): CommandResult {
    const { id, command } = queued;
    const currentStep = context.state.step;
    const handler = handlerFor(command);
    if (!handler) {
      return { id, ok: false, step: currentStep, error: 'INVALID_COMMAND' };
    }

    const draft: CommandContext = { state: cloneState(context.state) };
    const outcome = handler(draft, command);
    if (!outcome.ok) {
      return { id, ok: false, step: currentStep, error: outcome.error };
    }
    outcome.events.push(...rollBasementTreasure(draft.state, context.state.grid));
    context.state = draft.state;
    for (const event of outcome.events) {
      context.events.push({ ...event, step: currentStep, commandId: id } as EngineEvent);
    }
    return { id, ok: true, step: currentStep, cost: outcome.cost, refund: outcome.refund };
  }

  function advanceOneStep(context: StepContext): void {
    context.state.step += 1;
    for (const system of rules.systems) {
      system(context);
    }
  }

  function step(
    state: TowerState,
    commands: readonly QueuedCommand[],
    steps: number,
    graph?: TransportGraph,
  ): StepResult {
    assertNonNegativeInteger(steps, 'Step count');
    const context: StepContext = { state: stepCopy(state), events: [] };
    const results = commands.map((queued) => applyCommand(context, queued));
    const changesGraph = results.some(
      (result, index) => result.ok && isLayoutCommand(commandTypeOf(commands[index])),
    );
    const kept = graph ? { graph, inputs: null } : graphKeptFor(state);
    const known = kept.graph;
    const currentGraph =
      known && !changesGraph ? known : new TransportGraph(context.state, shaftStops(context.state));
    context.graph = currentGraph;
    for (let count = 0; count < steps; count++) {
      advanceOneStep(context);
    }
    graphsByState.set(context.state, {
      graph: currentGraph,
      inputs: graphInputsAfter(state, context.state, kept.inputs, results),
    });
    recordNotices(context.state, context.events);
    endStepCopy(context.state);
    return { state: context.state, results, events: context.events, graph: currentGraph };
  }

  function runDays(state: TowerState, days: number): StepResult {
    assertNonNegativeInteger(days, 'Day count');
    return step(state, [], days * STEPS_PER_DAY);
  }

  return { step, runDays };
}

const officeRoutine = createOfficeRoutine(
  (_state, from, to, context) => plannedTripSteps(context, from, to),
  { treks: true },
);

const residentRoutine = createResidentRoutine(
  (_state, from, to, context) => plannedTripSteps(context, from, to),
  { treks: true },
);

const prospects = createProspectDemand();

const customers = createCustomers();

const hotelGuests = createHotelGuests();

const nightReset = createNightReset(
  (context, slot) => cancelTrek(context, slot, { nightReset: true }),
  (pool, slot) => isOnTrek(pool, slot),
);

export const towerSystems: readonly SimulationSystem[] = [
  createScheduler([
    ledgerWeekRollHook,
    nightReset,
    weeklyUpkeepHook,
    ...venuePayoutHooks,
    officeRoutine.planHook,
    parkingAssignmentHook,
    residentRoutine.planHook,
    hotelGuests.planHook,
    hotelGuests.nightHook,
    ...prospects.rollHooks,
    vipBookingHook,
    hotelGuests.bookingHook,
    hotelGuests.giveUpHook,
    customers.planHook,
    customers.nightHook,
    weddingAttemptHook,
    maidArrivalHook,
    maidLeaveHook,
  ]),
  createLeaseSystem(storedGrade),
  createHotelSystem(),
  createCondoSystem(storedGrade),
  createDailyGradeSystem(),
  createTrekSystem(),
  prospects.system,
  officeRoutine.system,
  residentRoutine.system,
  hotelGuests.system,
  createMaidSystem(),
  customers.system,
  weddingSystem,
  createElevatorSystem(),
  createScheduler([starCheckHook]),
  eventsPhase,
];

const towerEngine = createEngine({ commandHandlers: towerCommandHandlers, systems: towerSystems });

/**
 * Applies the queued commands in order, then runs `steps` simulation steps.
 * The input state is never mutated. The result shares the parts no step changed with it, so a
 * caller that changes either one in place changes both.
 */
export const step = towerEngine.step;

export const runDays = towerEngine.runDays;
