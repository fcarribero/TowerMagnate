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
import { eventsPhase } from './events';
import { createCondoSystem } from './condos';
import { createHotelSystem } from './hotel';
import { createLeaseSystem } from './leases';
import { recordNotices } from './notices';
import { cloneState } from './state';
import { ledgerWeekRollHook } from './money';
import { createOfficeRoutine } from './office-routine';
import { createResidentRoutine } from './resident-routine';
import { createProspectDemand } from './prospects';
import { createScheduler } from './scheduler';
import { createTrekSystem, plannedTripSteps } from './trek';
import { TransportGraph, type ShaftStops } from './routing';
import { starCheckHook } from './stars';
import { weeklyUpkeepHook } from './upkeep';
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

/** Commands that change what the transport graph is built from. */
const GRAPH_COMMANDS: ReadonlySet<string> = new Set([
  'buildFloor',
  'buildLobby',
  'buildTransport',
  'buildUnit',
  'buildShaft',
  'resizeShaft',
  'demolish',
  'configureShaft',
]);

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
    const context: StepContext = { state: cloneState(state), events: [] };
    const results = commands.map((queued) => applyCommand(context, queued));
    const changesGraph = results.some(
      (result, index) => result.ok && GRAPH_COMMANDS.has(commandTypeOf(commands[index])),
    );
    const currentGraph =
      graph && !changesGraph ? graph : new TransportGraph(context.state, shaftStops(context.state));
    context.graph = currentGraph;
    for (let count = 0; count < steps; count++) {
      advanceOneStep(context);
    }
    recordNotices(context.state, context.events);
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

export const towerSystems: readonly SimulationSystem[] = [
  createScheduler([
    ledgerWeekRollHook,
    weeklyUpkeepHook,
    ...venuePayoutHooks,
    officeRoutine.planHook,
    residentRoutine.planHook,
    ...prospects.rollHooks,
  ]),
  createLeaseSystem(),
  createHotelSystem(),
  createCondoSystem(),
  createTrekSystem(),
  prospects.system,
  officeRoutine.system,
  residentRoutine.system,
  createElevatorSystem(),
  createScheduler([starCheckHook]),
  eventsPhase,
];

const towerEngine = createEngine({ commandHandlers: towerCommandHandlers, systems: towerSystems });

/**
 * Applies the queued commands in order, then runs `steps` simulation steps.
 * The input state is never mutated.
 */
export const step = towerEngine.step;

export const runDays = towerEngine.runDays;
