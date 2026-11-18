import {
  SECURITY_ACCESS_CONTROL_SCORE,
  STRESS_WINDOW_STEPS,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import {
  appraisalFactors,
  computeAppraisal,
  storeDailyAppraisals,
  type AppraisalFactors,
} from './appraisal';
import { STEPS_PER_DAY } from './clock';
import { gradeOfValue } from './evaluation';
import { bestSecurityUpgrade } from './security-upgrades';
import { isNoisy, noisyUnitIds } from './noise';
import type { SimulationSystem } from './step';
import { writableUnit, writableUnitLedger } from './step-copy';
import { unitNumber } from './units';
import { unitValue } from './unit-value';

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

/** True when the unit has ended trips in its window at `step`. */
export function hasTripsInWindow(state: TowerState, unit: Unit, step = state.step): boolean {
  return tripsInWindow(state, unit, step).count > 0;
}

/** Base stress B: the average trip stress in the unit's window, rounded down, 0 with no trips. */
export function unitBase(state: TowerState, unit: Unit, step = state.step): number {
  const { sum, count } = tripsInWindow(state, unit, step);
  return count === 0 ? 0 : Math.floor(sum / count);
}

/** Access control in the tower takes stress off condos and suites (service-units 2.3). */
export function guardedBase(state: TowerState, unit: Unit, base: number): number {
  if (unit.type !== 'condo' && unit.type !== 'suite') return base;
  const level = bestSecurityUpgrade(state, 'accessControl');
  return level === 0 ? base : Math.max(0, base - level * SECURITY_ACCESS_CONTROL_SCORE);
}

/** The grade of the unit at `state.step`: its value against its neighbors, at the tower rating. */
export function gradeUnit(
  state: TowerState,
  unit: Unit,
  noisy = isNoisy(state, unit),
  factors?: AppraisalFactors,
): TenantEvaluation {
  return gradeOfValue(unitValue(state, unit, noisy, factors).value, state.stars);
}

/**
 * Grades the unit and stores the grade: lease end, condo evaluation and hotel stay end (SE-19).
 * The fair price is brought up to date first, so the decision and the window agree.
 */
export function storeGrade(
  state: TowerState,
  unit: Unit,
  noisy = isNoisy(state, unit),
  factors: AppraisalFactors = appraisalFactors(state),
): TenantEvaluation {
  const writable = writableUnit(state, unit);
  writable.appraisal = computeAppraisal(state, writable, factors);
  const grade = gradeUnit(state, writable, noisy, factors);
  writable.evaluation = grade;
  return grade;
}

/**
 * The grade stored at a decision step. Lease ends and condo evaluations store a fresh grade just
 * before they read it (economy E-12, E-25).
 */
export function storedGrade(_state: TowerState, unit: Unit): TenantEvaluation | null {
  return unit.evaluation;
}

function hasOccupants(unit: Unit): boolean {
  return unit.type === 'condo' ? unit.sale !== null : unit.lease !== null;
}

/**
 * The daily 00:00 grade of offices, shops and condos (SE-20). A unit with no tenant or owners
 * has no grade; one with no trips in its window keeps the grade it had, or gets one from a base
 * of 0 if it has none.
 */
export function storeDailyGrade(
  state: TowerState,
  unit: Unit,
  noisy = isNoisy(state, unit),
  factors?: AppraisalFactors,
): void {
  if (!isEvaluatedUnit(unit) || isHotelRoom(unit)) return;
  if (!hasOccupants(unit)) {
    if (unit.evaluation !== null) writableUnit(state, unit).evaluation = null;
    return;
  }
  // With no trips in the window the unit keeps its grade, but an occupied unit that has none yet
  // gets one from the tower score, so it never shows "Sin evaluar" while someone lives or works
  // there.
  if (tripsInWindow(state, unit, state.step).count === 0 && unit.evaluation !== null) return;
  storeGrade(state, unit, noisy, factors);
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
  writableUnitLedger(state)[unit.id] = kept;
}

/**
 * Files the trip a person ended at a shop's door in the shop's ledger. Only a trip that ended
 * at this step counts, so a visit made without a trip files nothing.
 */
export function fileShopVisit(state: TowerState, shop: Unit, personId: number): void {
  if (shop.type !== 'retail-shop') return;
  const flat = state.tripLedger[String(personId)] ?? [];
  const endStep = flat[flat.length - 2];
  const stress = flat[flat.length - 1];
  if (endStep !== state.step || stress === undefined) return;
  fileUnitTrip(state, shop, endStep, stress);
}

/** A new office or shop tenant, a condo sale or a new hotel stay starts the ledger over (SE-13). */
export function clearUnitLedger(state: TowerState, unitId: UnitId): void {
  if (Object.hasOwn(state.unitLedger, unitId)) {
    Reflect.deleteProperty(writableUnitLedger(state), unitId);
  }
}

/**
 * Grades offices, shops and condos every day at 00:00. It runs after the lease and condo
 * systems, so the money events of the step come first (SE-20).
 */
export function createDailyGradeSystem(): SimulationSystem {
  return ({ state }) => {
    if (state.step % STEPS_PER_DAY === 0) storeDailyGrades(state);
  };
}

/** The 00:00 grade of every unit, in unit order. */
export function storeDailyGrades(state: TowerState): void {
  const noisy = noisyUnitIds(state);
  const factors = { ...appraisalFactors(state), noisy };
  const units = Object.values(state.units).sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of units) storeDailyGrade(state, unit, noisy.has(unit.id), factors);
  storeDailyAppraisals(state);
}
