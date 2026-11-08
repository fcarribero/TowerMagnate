import type { TowerState } from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { towerCommandHandlers } from '../commands';
import { addPeopleForUnit, peopleCount } from '../people';
import { createEngine, towerSystems, type Engine, type SimulationSystem } from '../step';
import { isOnTrek } from '../trek';
import { medianOf } from './fastest-run';
import { addFlight } from './hundred-floor-tower';
import { buildTower, plainTowerPlan, type PlannedShaft, type PlannedUnit } from './tower-builder';

const FLOORS = 60;
const OFFICES = 500;
const OFFICE_WIDTH = 9;
const OFFICES_PER_FLOOR = 9;
const SHAFT_COLUMNS_PER_HALF = 6;
const TOWER_X1 = 200;
const SPLIT_LEVEL = 30;

const RUNS = 3;
const SAMPLE_EVERY = 60;
const THREE_AM = STEPS_PER_DAY + 3 * STEPS_PER_HOUR;

export const MAX_SPREAD = 0.15;
export const MAX_AVERAGE_MS = 1.0;
export const MAX_P99_MS = 5;

/** Matches the order of `towerSystems`. */
export const SYSTEM_NAMES = [
  'scheduler (ledger, upkeep, office plans)',
  'leases',
  'hotels',
  'condos',
  'daily grades',
  'trek',
  'prospects',
  'office routine',
  'resident routine',
  'elevators',
  'scheduler (star check)',
  'events',
];

/** 500 offices of 6 workers on levels 2..60, served by two banks of 6 shafts that meet at level 30. */
export function sixtyFloorTower(): TowerState {
  const shafts: PlannedShaft[] = [];
  for (let index = 0; index < SHAFT_COLUMNS_PER_HALF; index++) {
    const x = 4 + index * 4;
    shafts.push({ type: 'standard', x, bottom: 1, top: SPLIT_LEVEL });
    shafts.push({ type: 'standard', x: x + 30, bottom: SPLIT_LEVEL + 1, top: FLOORS });
  }
  const units: PlannedUnit[] = [];
  for (let level = 2; units.length < OFFICES; level++) {
    for (let slot = 0; slot < OFFICES_PER_FLOOR && units.length < OFFICES; slot++) {
      units.push({ type: 'office', level, x: 60 + slot * OFFICE_WIDTH });
    }
  }
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(FLOORS, 0, TOWER_X1),
    units,
    shafts,
  });
  addFlight(state, 'stairs', 40, SPLIT_LEVEL);
  for (const id of unitIds) addPeopleForUnit(state, id);
  return state;
}

function peopleOnTheMove(state: TowerState): number {
  let moving = 0;
  for (let slot = 0; slot < peopleCount(state.people); slot++) {
    if (isOnTrek(state.people, slot)) moving++;
  }
  return moving;
}

export interface WeekdayRun {
  averageMs: number;
  p99Ms: number;
  /** Average milliseconds per step spent in each system, in `SYSTEM_NAMES` order. */
  systemAverageMs: number[];
  movingAt3am: number;
  mostMoving: number;
  people: number;
}

interface StepTimes {
  total: Float64Array;
  perSystem: Float64Array[];
}

/** The engine's own systems, each timed, so a step's cost is the sum of its systems. */
function timedEngine(times: StepTimes): Engine {
  const systems = towerSystems.map((system, systemIndex): SimulationSystem => {
    const own = times.perSystem[systemIndex] as Float64Array;
    return (context) => {
      const started = performance.now();
      system(context);
      const index = context.state.step - 1 - STEPS_PER_DAY;
      if (index < 0) return;
      const elapsed = performance.now() - started;
      times.total[index] = (times.total[index] ?? 0) + elapsed;
      own[index] = elapsed;
    };
  });
  return createEngine({ commandHandlers: towerCommandHandlers, systems });
}

function averageOf(values: Float64Array): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Runs the first weekday that has commuters and times every step of it. */
export function runWeekday(): WeekdayRun {
  const state = sixtyFloorTower();
  const people = peopleCount(state.people);
  const times: StepTimes = {
    total: new Float64Array(STEPS_PER_DAY),
    perSystem: towerSystems.map(() => new Float64Array(STEPS_PER_DAY)),
  };
  const engine = timedEngine(times);
  let movingAt3am = -1;
  let mostMoving = 0;
  const sample = (at: TowerState) => {
    if (at.step === THREE_AM) movingAt3am = peopleOnTheMove(at);
    mostMoving = Math.max(mostMoving, peopleOnTheMove(at));
  };
  // The first plans are drawn at the 00:00 after the start, so day 1 (Tuesday) is the first with commuters.
  let current = engine.step(state, [], STEPS_PER_DAY).state;
  for (let chunk = 0; chunk < STEPS_PER_DAY / SAMPLE_EVERY; chunk++) {
    current = engine.step(current, [], SAMPLE_EVERY).state;
    sample(current);
  }
  const sorted = Array.from(times.total).sort((a, b) => a - b);
  return {
    averageMs: averageOf(times.total),
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] as number,
    systemAverageMs: times.perSystem.map(averageOf),
    movingAt3am,
    mostMoving,
    people,
  };
}

export function spreadOf(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) / medianOf(values);
}

/** Three weekday runs; when they differ by over 15% the result is void and three new runs are made. */
export function timeThreeRuns(): WeekdayRun[] {
  const runs = Array.from({ length: RUNS }, runWeekday);
  const agree = (pick: (run: WeekdayRun) => number) => spreadOf(runs.map(pick)) <= MAX_SPREAD;
  const settled = agree((run) => run.averageMs) && agree((run) => run.p99Ms);
  return settled ? runs : Array.from({ length: RUNS }, runWeekday);
}

/** The timing summary: machine, Node, each run's result and the median cost of each system. */
export function weekdayReport(runs: WeekdayRun[], machine: string, nodeVersion: string): string {
  const list = (values: number[]) => values.map((value) => value.toFixed(3)).join(', ');
  const averages = runs.map((run) => run.averageMs);
  const p99s = runs.map((run) => run.p99Ms);
  const systemLines = SYSTEM_NAMES.map((name, index) => {
    const median = medianOf(runs.map((run) => run.systemAverageMs[index] as number));
    return `  ${median.toFixed(3).padStart(8)} ms  ${name}`;
  });
  return [
    `Machine: ${machine}`,
    `Node ${nodeVersion}`,
    `People ${runs[0]?.people}, steps per run ${STEPS_PER_DAY}`,
    `Average step ms per run: ${list(averages)} (median ${medianOf(averages).toFixed(3)}, budget ${MAX_AVERAGE_MS})`,
    `p99 step ms per run: ${list(p99s)} (median ${medianOf(p99s).toFixed(3)}, budget ${MAX_P99_MS})`,
    'Median average ms per step, by system:',
    ...systemLines,
    `Most people on the move at a 10-minute mark: ${Math.max(...runs.map((r) => r.mostMoving))}`,
    `People on the move at 03:00: ${list(runs.map((run) => run.movingAt3am))}`,
  ].join('\n');
}
