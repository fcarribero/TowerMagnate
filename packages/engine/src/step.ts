import type {
  Command,
  CommandResult,
  EngineEvent,
  ErrorCode,
  QueuedCommand,
  TowerState,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import { ledgerWeekRollHook } from './money';
import { createScheduler } from './scheduler';

export interface StepResult {
  state: TowerState;
  results: CommandResult[];
  events: EngineEvent[];
}

/** Working copy of the tower that handlers and systems may mutate, plus the events so far. */
export interface StepContext {
  state: TowerState;
  events: EngineEvent[];
}

export type CommandOutcome =
  { ok: true; cost: number; refund: number } | { ok: false; error: ErrorCode };

export type CommandHandler<K extends Command['type']> = (
  context: StepContext,
  command: Extract<Command, { type: K }>,
) => CommandOutcome;

export type CommandHandlers = { [K in Command['type']]?: CommandHandler<K> };

/** Runs once per simulation step, after the step counter has advanced. */
export type SimulationSystem = (context: StepContext) => void;

export interface EngineRules {
  commandHandlers: CommandHandlers;
  systems: readonly SimulationSystem[];
}

export interface Engine {
  step(state: TowerState, commands: readonly QueuedCommand[], steps: number): StepResult;
  runDays(state: TowerState, days: number): StepResult;
}

type AnyCommandHandler = (context: StepContext, command: Command) => CommandOutcome;

function assertNonNegativeInteger(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer, got ${value}`);
  }
}

export function createEngine(rules: EngineRules): Engine {
  function applyCommand(context: StepContext, queued: QueuedCommand): CommandResult {
    const { id, command } = queued;
    const currentStep = context.state.step;
    const handler = rules.commandHandlers[command.type] as AnyCommandHandler | undefined;
    if (!handler) {
      return { id, ok: false, step: currentStep, error: 'INVALID_COMMAND' };
    }

    const draft: StepContext = { state: structuredClone(context.state), events: [] };
    const outcome = handler(draft, command);
    if (!outcome.ok) {
      return { id, ok: false, step: currentStep, error: outcome.error };
    }
    context.state = draft.state;
    context.events.push(...draft.events);
    return { id, ok: true, step: currentStep, cost: outcome.cost, refund: outcome.refund };
  }

  function advanceOneStep(context: StepContext): void {
    context.state.step += 1;
    for (const system of rules.systems) {
      system(context);
    }
  }

  function step(state: TowerState, commands: readonly QueuedCommand[], steps: number): StepResult {
    assertNonNegativeInteger(steps, 'Step count');
    const context: StepContext = { state: structuredClone(state), events: [] };
    const results = commands.map((queued) => applyCommand(context, queued));
    for (let count = 0; count < steps; count++) {
      advanceOneStep(context);
    }
    return { state: context.state, results, events: context.events };
  }

  function runDays(state: TowerState, days: number): StepResult {
    assertNonNegativeInteger(days, 'Day count');
    return step(state, [], days * STEPS_PER_DAY);
  }

  return { step, runDays };
}

const towerEngine = createEngine({
  commandHandlers: {},
  systems: [createScheduler([ledgerWeekRollHook])],
});

/**
 * Applies the queued commands in order, then runs `steps` simulation steps.
 * The input state is never mutated.
 */
export const step = towerEngine.step;

export const runDays = towerEngine.runDays;
