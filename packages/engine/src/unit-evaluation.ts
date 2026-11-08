import {
  STRESS_WINDOW_STEPS,
  type PriceLevel,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import { evaluateUnit } from './evaluation';
import { isNoisy } from './noise';
import type { SimulationSystem } from './step';
import { unitNumber } from './units';

const EVALUATED_TYPES: readonly UnitType[] = [
  'office',
  'retail-shop',
  'condo',
  'single-room',
  'double-room',
  'suite',
];

const HOTEL_ROOM_TYPES: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

export function isEvaluatedUnit(unit: Unit): boolean {
  return EVALUATED_TYPES.includes(unit.type);
}

function isHotelRoom(unit: Unit): boolean {
  return HOTEL_ROOM_TYPES.includes(unit.type);
}

/** Steps `[from, to]` whose ended trips count for the unit's base at `step` (SE-12). */
function windowOf(unit: Unit, step: number): { from: number; to: number } | null {
  if (isHotelRoom(unit)) {
    const checkIn = unit.hotel?.checkInStep ?? null;
    if (checkIn === null) return null;
    const stayEnd = unit.hotel?.stayEndStep ?? step;
    return { from: checkIn, to: Math.min(stayEnd, step) };
  }
  return { from: step - STRESS_WINDOW_STEPS, to: step - 1 };
}

interface WindowTrips {
  sum: number;
  count: number;
}

function tripsInWindow(state: TowerState, unit: Unit, step: number): WindowTrips {
  const window = windowOf(unit, step);
  const flat = state.unitLedger[unit.id] ?? [];
  const trips = { sum: 0, count: 0 };
  if (!window) return trips;
  for (let at = 0; at < flat.length; at += 2) {
    const endStep = flat[at] as number;
    if (endStep < window.from || endStep > window.to) continue;
    trips.sum += flat[at + 1] as number;
    trips.count += 1;
  }
  return trips;
}

/** Base stress B: the average trip stress in the unit's window, rounded down, 0 with no trips. */
export function unitBase(state: TowerState, unit: Unit, step = state.step): number {
  const { sum, count } = tripsInWindow(state, unit, step);
  return count === 0 ? 0 : Math.floor(sum / count);
}

/**
 * The price level the grade uses (SE-15). A sold condo cannot change its level, so the unit's
 * level is the sale level; a room uses what its stay paid.
 */
function priceOf(unit: Unit): PriceLevel {
  if (isHotelRoom(unit)) return unit.hotel?.paidLevel ?? unit.priceLevel;
  return unit.priceLevel;
}

/** The grade of the unit at `state.step` from its ledger, price, noise and the tower rating. */
export function gradeUnit(state: TowerState, unit: Unit): TenantEvaluation {
  return evaluateUnit({
    base: unitBase(state, unit),
    price: priceOf(unit),
    noisy: isNoisy(state, unit),
    stars: state.stars,
  }).grade;
}

/** Grades the unit and stores the grade: lease end, condo evaluation and hotel stay end (SE-19). */
export function storeGrade(state: TowerState, unit: Unit): TenantEvaluation {
  const grade = gradeUnit(state, unit);
  unit.evaluation = grade;
  return grade;
}

function hasOccupants(unit: Unit): boolean {
  return unit.type === 'condo' ? unit.sale !== null : unit.lease !== null;
}

/**
 * The daily 00:00 grade of offices, shops and condos (SE-20). A unit with no tenant or owners
 * has no grade; one with no trips in its window keeps the grade it had.
 */
export function storeDailyGrade(state: TowerState, unit: Unit): void {
  if (!isEvaluatedUnit(unit) || isHotelRoom(unit)) return;
  if (!hasOccupants(unit)) {
    unit.evaluation = null;
    return;
  }
  if (tripsInWindow(state, unit, state.step).count === 0) return;
  storeGrade(state, unit);
}

/**
 * Files a finished trip in the unit's ledger. Trips that can no longer reach a window of
 * offices, shops and condos are dropped; a room's ledger starts over with each stay.
 */
export function fileUnitTrip(state: TowerState, unit: Unit, endStep: number, stress: number) {
  if (!isEvaluatedUnit(unit)) return;
  const flat = state.unitLedger[unit.id] ?? [];
  const oldest = endStep - STRESS_WINDOW_STEPS;
  const kept: number[] = [];
  for (let at = 0; at < flat.length; at += 2) {
    const tripEnd = flat[at] as number;
    if (isHotelRoom(unit) || tripEnd >= oldest) kept.push(tripEnd, flat[at + 1] as number);
  }
  kept.push(endStep, stress);
  state.unitLedger[unit.id] = kept;
}

/** A new office or shop tenant, a condo sale or a new hotel stay starts the ledger over (SE-13). */
export function clearUnitLedger(state: TowerState, unitId: UnitId): void {
  Reflect.deleteProperty(state.unitLedger, unitId);
}

/**
 * Grades offices, shops and condos every day at 00:00. It runs after the lease and condo
 * systems, so the money events of the step come first (SE-20).
 */
export function createDailyGradeSystem(): SimulationSystem {
  return ({ state }) => {
    if (state.step % STEPS_PER_DAY !== 0) return;
    const units = Object.values(state.units).sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
    for (const unit of units) storeDailyGrade(state, unit);
  };
}
