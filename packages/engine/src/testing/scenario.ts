import type {
  Command,
  CommandResult,
  EngineEvent,
  QueuedCommand,
  TowerState,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';
import { createTower } from '../state';
import { step as towerStep, type Engine } from '../step';

export interface ScriptedCommand {
  /** Whole days after the start of the scenario. */
  day: number;
  command: Command;
}

export interface Scenario {
  /** Starting tower, for example from `buildTower`. Defaults to an empty tower from `seed`. */
  tower?: TowerState;
  seed?: number;
  script?: readonly ScriptedCommand[];
  days: number;
  engine?: Pick<Engine, 'step'>;
}

export interface ScenarioRun {
  state: TowerState;
  results: CommandResult[];
  events: EngineEvent[];
}

/**
 * Plays a scripted tower: each day's commands go in at 00:00, then the day runs to the end.
 * Days count from the starting tower's own step.
 */
export function runScenario(scenario: Scenario): ScenarioRun {
  const { seed = 1, script = [], days } = scenario;
  const step = scenario.engine?.step ?? towerStep;
  assertScript(script, days);
  if (scenario.tower && scenario.seed !== undefined) {
    throw new Error('Give a scenario either a starting tower or a seed, not both');
  }

  let state = scenario.tower ?? createTower(seed);
  const results: CommandResult[] = [];
  const events: EngineEvent[] = [];
  let commandCount = 0;
  for (let day = 0; day < days; day++) {
    const queued: QueuedCommand[] = script
      .filter((entry) => entry.day === day)
      .map((entry) => ({ id: `s${++commandCount}`, command: entry.command }));
    const outcome = step(state, queued, STEPS_PER_DAY);
    state = outcome.state;
    results.push(...outcome.results);
    events.push(...outcome.events);
  }
  return { state, results, events };
}

function assertScript(script: readonly ScriptedCommand[], days: number): void {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError(`Scenario days must be a non-negative integer, got ${days}`);
  }
  for (const entry of script) {
    if (!Number.isInteger(entry.day) || entry.day < 0 || entry.day >= days) {
      throw new RangeError(`Scripted command on day ${entry.day} is outside 0..${days - 1}`);
    }
  }
}
