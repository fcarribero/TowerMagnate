import type { TowerState } from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { moveInTenant } from '../leases';
import { addPeopleForUnit, peopleCount } from '../people';
import { towerCommandHandlers } from '../commands';
import { createEngine, namedTowerSystems, type Engine, type SimulationSystem } from '../step';
import { medianOf } from './fastest-run';
import { addFlight } from './hundred-floor-tower';
import { buildTower, plainTowerPlan, type PlannedShaft, type PlannedUnit } from './tower-builder';

const FLOORS = 100;
const TOWER_X1 = 374;
const ZONE_FLOORS = 25;
const SHAFTS_PER_ZONE = 6;
const CARS_PER_SHAFT_BY_ZONE = [4, 4, 4, 4];
const SHAFT_SPACING = 4;
const ZONE_SPACING = 30;
const STAIRS_X = 124;
const FIRST_OFFICE_X = 130;
const OFFICE_WIDTH = 9;
const OFFICES = 2_500;

/** The section 9 budget: one `step` call of one step on a 15,000-person tower. */
export const FULL_TOWER_STEP_BUDGET_MS = 5;
export const FULL_TOWER_PEOPLE = 15_000;

const RUNS = 3;
const MAX_SPREAD = 0.15;
const TIMED_FROM = STEPS_PER_DAY + 6 * STEPS_PER_HOUR;
const TIMED_STEPS = 8 * STEPS_PER_HOUR;

/**
 * 2,500 leased offices of 6 workers on 100 floors. Four zones of 25 floors each have a bank of six
 * standard elevators, and stairs join each zone to the next. Every shaft has 4 cars, 96 in all.
 */
export function fullTower(): TowerState {
  const shafts: PlannedShaft[] = [];
  const zones = FLOORS / ZONE_FLOORS;
  for (let zone = 0; zone < zones; zone++) {
    const bottom = zone * ZONE_FLOORS + 1;
    for (let index = 0; index < SHAFTS_PER_ZONE; index++) {
      const x = SHAFT_SPACING + zone * ZONE_SPACING + index * SHAFT_SPACING;
      const cars = CARS_PER_SHAFT_BY_ZONE[zone] as number;
      shafts.push({ type: 'standard', x, bottom, top: bottom + ZONE_FLOORS - 1, cars });
    }
  }
  const units: PlannedUnit[] = [];
  for (let level = 2; units.length < OFFICES; level++) {
    for (let x = FIRST_OFFICE_X; x + OFFICE_WIDTH - 1 <= TOWER_X1; x += OFFICE_WIDTH) {
      if (units.length < OFFICES) units.push({ type: 'office', level, x });
    }
  }
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(FLOORS, 0, TOWER_X1),
    units,
    shafts,
  });
  for (let zone = 1; zone < zones; zone++) addFlight(state, 'stairs', STAIRS_X, zone * ZONE_FLOORS);
  const context = { state, events: [] };
  for (const id of unitIds) {
    moveInTenant(context, id);
    addPeopleForUnit(state, id);
  }
  return state;
}

export interface FullTowerRun {
  people: number;
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Average cost of a step when the same hours run in one `step` call, which copies the state once. */
  batchedMs: number;
  /** Each system's cost per timed step, in `namedTowerSystems` order. */
  systems: SystemTiming[];
}

export interface SystemTiming {
  name: string;
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface Percentiles {
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function percentilesOf(times: Float64Array): Percentiles {
  const sorted = Array.from(times).sort((a, b) => a - b);
  const at = (share: number) => sorted[Math.floor(sorted.length * share)] as number;
  return {
    averageMs: sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length,
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[sorted.length - 1] as number,
  };
}

/**
 * The engine's own systems, each timed into `perSystem` at the index of the step being timed.
 * `timedIndex` returns -1 outside the timed steps.
 */
function timedEngine(perSystem: Float64Array[], timedIndex: () => number): Engine {
  const systems = namedTowerSystems.map(({ system }, systemIndex): SimulationSystem => {
    const own = perSystem[systemIndex] as Float64Array;
    return (context) => {
      const started = performance.now();
      system(context);
      const index = timedIndex();
      if (index >= 0) own[index] = performance.now() - started;
    };
  });
  return createEngine({ commandHandlers: towerCommandHandlers, systems });
}

/**
 * Times every one-step `step` call from 06:00 to 14:00 of the first weekday with commuters.
 * Each call includes the state copy the engine makes on entry, as the server pays it.
 */
export function timeFullTowerDay(): FullTowerRun {
  const perSystem = namedTowerSystems.map(() => new Float64Array(TIMED_STEPS));
  let timing = -1;
  const engine = timedEngine(perSystem, () => timing);
  const atSix = engine.step(fullTower(), [], TIMED_FROM).state;
  const batchStarted = performance.now();
  engine.step(atSix, [], TIMED_STEPS);
  const batchedMs = (performance.now() - batchStarted) / TIMED_STEPS;

  let state = atSix;
  const times = new Float64Array(TIMED_STEPS);
  for (let index = 0; index < TIMED_STEPS; index++) {
    timing = index;
    const started = performance.now();
    state = engine.step(state, [], 1).state;
    times[index] = performance.now() - started;
  }
  return {
    people: peopleCount(state.people),
    ...percentilesOf(times),
    batchedMs,
    systems: namedTowerSystems.map(({ name }, index) => ({
      name,
      ...percentilesOf(perSystem[index] as Float64Array),
    })),
  };
}

function spread(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) / medianOf(values);
}

export interface FullTowerResult {
  runs: FullTowerRun[];
  runsAgree: boolean;
}

/** Three runs; when their p95 differs by over 15% the result is void and three new runs are made. */
export function timeFullTowerRuns(): FullTowerResult {
  const threeRuns = () => Array.from({ length: RUNS }, timeFullTowerDay);
  const agree = (runs: FullTowerRun[]) => spread(runs.map((run) => run.p95Ms)) <= MAX_SPREAD;
  const first = threeRuns();
  if (agree(first)) return { runs: first, runsAgree: true };
  const second = threeRuns();
  return { runs: second, runsAgree: agree(second) };
}

/** The systems that carry the morning peak, each held to its own p95 limit by the gate. */
export const PEAK_SYSTEMS: readonly string[] = ['trek', 'office routine'];

export interface FullTowerLimits {
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  /** Limit on the median p95 of each of `PEAK_SYSTEMS`; no limit when left out. */
  systemP95Ms?: number;
  /** Median p95 of a peak system above this is reported but does not fail the gate. */
  systemP95ReportMs?: number;
}

function systemP95(run: FullTowerRun, name: string): number {
  const timing = run.systems.find((system) => system.name === name);
  if (!timing) throw new Error(`The bench timed no system named ${name}`);
  return timing.p95Ms;
}

/** The reasons a result fails the limits: a median over its limit, or runs that disagree. */
export function fullTowerGateFailures(result: FullTowerResult, limits: FullTowerLimits): string[] {
  const failures: string[] = [];
  if (!result.runsAgree) failures.push('Runs differ by over 15%, result void.');
  const checks: [label: string, key: 'averageMs' | 'p95Ms' | 'p99Ms'][] = [
    ['Average', 'averageMs'],
    ['p95', 'p95Ms'],
    ['p99', 'p99Ms'],
  ];
  for (const [label, key] of checks) {
    const median = medianOf(result.runs.map((run) => run[key]));
    if (median > limits[key]) {
      failures.push(`${label} median ${median.toFixed(2)} ms is over the ${limits[key]} ms limit.`);
    }
  }
  const systemLimit = limits.systemP95Ms;
  if (systemLimit === undefined) return failures;
  for (const name of PEAK_SYSTEMS) {
    const median = medianOf(result.runs.map((run) => systemP95(run, name)));
    if (median > systemLimit) {
      failures.push(
        `${name} p95 median ${median.toFixed(2)} ms is over the ${systemLimit} ms limit.`,
      );
    }
  }
  return failures;
}

/** The peak systems whose median p95 is over the report limit but not over the failing one. */
export function fullTowerGateWarnings(result: FullTowerResult, limits: FullTowerLimits): string[] {
  const reportLimit = limits.systemP95ReportMs;
  if (reportLimit === undefined) return [];
  const warnings: string[] = [];
  for (const name of PEAK_SYSTEMS) {
    const median = medianOf(result.runs.map((run) => systemP95(run, name)));
    if (median > reportLimit && median <= (limits.systemP95Ms ?? Infinity)) {
      warnings.push(`${name} p95 median ${median.toFixed(2)} ms is over ${reportLimit} ms.`);
    }
  }
  return warnings;
}
