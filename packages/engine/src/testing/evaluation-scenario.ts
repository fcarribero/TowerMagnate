import {
  STRESS_WINDOW_STEPS,
  type Level,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';
import { storeDailyGrades } from '../unit-evaluation';
import { medianOf } from './fastest-run';
import { buildTower, plainTowerPlan, type PlannedUnit } from './tower-builder';

export const MAX_DAILY_GRADES_MS = 5;
export const EVALUATED_UNITS = 300;

const PATTERN: readonly { type: UnitType; width: number }[] = [
  { type: 'office', width: 9 },
  { type: 'condo', width: 16 },
  { type: 'retail-shop', width: 12 },
];
const PATTERNS_PER_FLOOR = 10;
const TOWER_X1 = 374;
const FIRST_LEVEL = 2;
const TRIPS_PER_UNIT = 120;
const MIDNIGHT = 10 * STEPS_PER_DAY;
const WARM_UP_CALLS = 5;
const CALLS_PER_RUN = 11;
const RUNS = 3;

function unitPlacements(): PlannedUnit[] {
  const units: PlannedUnit[] = [];
  for (let level = FIRST_LEVEL; units.length < EVALUATED_UNITS; level++) {
    let x = 0;
    for (let index = 0; index < PATTERNS_PER_FLOOR * PATTERN.length; index++) {
      const { type, width } = PATTERN[index % PATTERN.length] as (typeof PATTERN)[number];
      units.push({ type, level: level as Level, x });
      x += width;
    }
  }
  return units.slice(0, EVALUATED_UNITS);
}

/**
 * Offices, condos and shops in equal parts, all let or sold, each with a full week of trips,
 * at the 00:00 of day 10.
 */
export function evaluationTower(): TowerState {
  const placements = unitPlacements();
  const floors = Math.max(...placements.map((unit) => unit.level));
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(floors, 0, TOWER_X1),
    units: placements,
  });
  state.step = MIDNIGHT;
  for (const id of unitIds) {
    const unit = state.units[id];
    if (!unit) continue;
    if (unit.type === 'condo')
      unit.sale = { price: 1, anchorStep: 0, nextEvaluationStep: MIDNIGHT * 2 };
    else unit.lease = { anchorStep: 0, nextDueStep: MIDNIGHT * 2 };
    const trips: number[] = [];
    for (let trip = 0; trip < TRIPS_PER_UNIT; trip++) {
      const endStep = MIDNIGHT - 1 - Math.floor((trip * STRESS_WINDOW_STEPS) / TRIPS_PER_UNIT);
      trips.unshift(endStep, 20 + ((trip * 37) % 200));
    }
    state.unitLedger[id] = trips;
  }
  return state;
}

function timeCall(state: TowerState): number {
  const start = performance.now();
  storeDailyGrades(state);
  return performance.now() - start;
}

/** Median time of the 00:00 grades in each of 3 runs, after a warm-up. */
export function timeDailyGrades(): number[] {
  const state = evaluationTower();
  for (let call = 0; call < WARM_UP_CALLS; call++) timeCall(state);
  return Array.from({ length: RUNS }, () =>
    medianOf(Array.from({ length: CALLS_PER_RUN }, () => timeCall(state))),
  );
}
