import type { TowerState } from '@tower-magnate/shared';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { addPeopleForUnit, peopleCount } from '../people';
import { towerCommandHandlers } from '../commands';
import { createEngine, towerSystems, type Engine, type SimulationSystem } from '../step';
import {
  addFlight,
  buildTower,
  medianOf,
  plainTowerPlan,
  type PlannedShaft,
  type PlannedUnit,
} from '../testing';
import { isOnTrek } from '../trek';

const FLOORS = 60;
const OFFICES = 500;
const OFFICE_WIDTH = 9;
const OFFICES_PER_FLOOR = 9;
const SHAFT_COLUMNS_PER_HALF = 6;
const TOWER_X1 = 200;
const SPLIT_LEVEL = 30;

const RUNS = 3;
const MAX_SPREAD = 0.15;
const MAX_AVERAGE_MS = 1.0;
const MAX_P99_MS = 5;
const SAMPLE_EVERY = 60;
const THREE_AM = STEPS_PER_DAY + 3 * STEPS_PER_HOUR;

/** 500 offices of 6 workers on levels 2..60, served by two banks of 6 shafts that meet at level 30. */
function sixtyFloorTower(): TowerState {
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

interface WeekdayRun {
  averageMs: number;
  p99Ms: number;
  movingAt3am: number;
  mostMoving: number;
  people: number;
}

/** The engine's own systems, each timed, so a step's cost is the sum of its systems. */
function timedEngine(stepMs: Float64Array): Engine {
  const systems = towerSystems.map((system): SimulationSystem => {
    return (context) => {
      const started = performance.now();
      system(context);
      const index = context.state.step - 1 - STEPS_PER_DAY;
      if (index < 0) return;
      stepMs[index] = (stepMs[index] ?? 0) + (performance.now() - started);
    };
  });
  return createEngine({ commandHandlers: towerCommandHandlers, systems });
}

function runWeekday(): WeekdayRun {
  const state = sixtyFloorTower();
  const people = peopleCount(state.people);
  const stepMs = new Float64Array(STEPS_PER_DAY);
  const engine = timedEngine(stepMs);
  let movingAt3am = -1;
  let mostMoving = 0;
  const sample = (at: TowerState) => {
    if (at.step === THREE_AM) movingAt3am = peopleOnTheMove(at);
    mostMoving = Math.max(mostMoving, peopleOnTheMove(at));
  };
  // The first plans are drawn at the 00:00 after the start, so day 1 (Tuesday) is the first with commuters.
  const first = engine.step(state, [], STEPS_PER_DAY);
  let current = first.state;
  const { graph } = first;
  for (let chunk = 0; chunk < STEPS_PER_DAY / SAMPLE_EVERY; chunk++) {
    current = engine.step(current, [], SAMPLE_EVERY, graph).state;
    sample(current);
  }
  const sorted = Array.from(stepMs).sort((a, b) => a - b);
  const total = sorted.reduce((sum, ms) => sum + ms, 0);
  return {
    averageMs: total / sorted.length,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] as number,
    movingAt3am,
    mostMoving,
    people,
  };
}

function spreadOf(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) / medianOf(values);
}

function timeThreeRuns(): WeekdayRun[] {
  const runs = Array.from({ length: RUNS }, runWeekday);
  const agree = (pick: (run: WeekdayRun) => number) => spreadOf(runs.map(pick)) <= MAX_SPREAD;
  const settled = agree((run) => run.averageMs) && agree((run) => run.p99Ms);
  return settled ? runs : Array.from({ length: RUNS }, runWeekday);
}

// A weekday takes minutes, so it only runs on request: TM_PERF=1 pnpm --filter @tower-magnate/engine test transport-performance
const describePerf = process.env.TM_PERF ? describe : describe.skip;

describePerf('scenario: 60-floor tower, 3,000 people, 12 shafts', () => {
  it('runs one weekday inside the step time budget and leaves nobody on the move at 03:00', () => {
    const runs = timeThreeRuns();
    const averages = runs.map((run) => run.averageMs);
    const p99s = runs.map((run) => run.p99Ms);
    const list = (values: number[]) => values.map((value) => value.toFixed(3)).join(', ');
    console.info(
      [
        `Machine: ${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${os.platform()}`,
        `Node ${process.version}`,
        `People ${runs[0]?.people}, steps per run ${STEPS_PER_DAY}`,
        `Average step ms per run: ${list(averages)} (median ${medianOf(averages).toFixed(3)})`,
        `p99 step ms per run: ${list(p99s)} (median ${medianOf(p99s).toFixed(3)})`,
        `Most people on the move at a 10-minute mark: ${Math.max(...runs.map((r) => r.mostMoving))}`,
        `People on the move at 03:00: ${list(runs.map((run) => run.movingAt3am))}`,
      ].join('\n'),
    );

    expect(runs[0]?.people).toBe(3000);
    expect(spreadOf(averages)).toBeLessThanOrEqual(MAX_SPREAD);
    expect(spreadOf(p99s)).toBeLessThanOrEqual(MAX_SPREAD);
    expect(medianOf(averages)).toBeLessThanOrEqual(MAX_AVERAGE_MS);
    expect(medianOf(p99s)).toBeLessThanOrEqual(MAX_P99_MS);
    for (const run of runs) expect(run.movingAt3am).toBe(0);
  }, 900_000);
});
