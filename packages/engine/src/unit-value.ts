import {
  EVAL_NOISE_SCORE,
  FAIR_PRICE_STRESS_PERCENT,
  NEIGHBOR_PULL,
  STRESS_SCORE_MAX,
  stressScore,
  TOWER_SCORE_DEFAULT,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { appraisalFactors, computeAppraisal, type AppraisalFactors } from './appraisal';
import { touchingUnits } from './neighbors';
import { isNoisy } from './noise';
import { guardedBase, hasTripsInWindow, unitBase } from './unit-evaluation';

/** Score of the average of every trip filed in the tower; 3, the neutral point, with none. */
export function towerScore(state: TowerState): number {
  let sum = 0;
  let count = 0;
  for (const flat of Object.values(state.tripLedger)) {
    for (let at = 1; at < flat.length; at += 2) {
      sum += flat[at] as number;
      count += 1;
    }
  }
  return count === 0 ? TOWER_SCORE_DEFAULT : stressScore(sum / count);
}

/**
 * The stress score of a unit's occupants: the score of its base stress, or the tower score when
 * it has no trips in its window, plus 1 with a noise source close by, never past 10.
 */
export function occupantScore(
  state: TowerState,
  unit: Unit,
  noisy = isNoisy(state, unit),
  tower?: number,
): number {
  const score = hasTripsInWindow(state, unit)
    ? stressScore(guardedBase(state, unit, unitBase(state, unit)))
    : (tower ?? towerScore(state));
  return Math.min(STRESS_SCORE_MAX, score + (noisy ? EVAL_NOISE_SCORE : 0));
}

/** Percent the occupants' score adds to the fair price: +30 at 0, 0 at 3, -50 at 10. */
export function occupantPercent(score: number): number {
  const { best, neutralAt, worst } = FAIR_PRICE_STRESS_PERCENT;
  if (score <= neutralAt) return best * (1 - score / neutralAt);
  return (worst * (score - neutralAt)) / (STRESS_SCORE_MAX - neutralAt);
}

/**
 * True while a unit has someone who pays for it: an office or shop with a lease, a sold condo, a
 * hotel room with a stay in progress. Only these pull their neighbors down.
 */
export function hasOccupants(unit: Unit): boolean {
  if (unit.type === 'condo') return unit.sale !== null;
  if (unit.type === 'office' || unit.type === 'retail-shop') return unit.lease !== null;
  return unit.hotel?.stayEndStep != null;
}

/** What the occupants pay: the stay's nightly rate for a room, the unit's price otherwise. */
function paidPrice(unit: Unit): number {
  return unit.hotel?.stayRate ?? unit.price;
}

/**
 * Fair price over the price paid; infinite when nothing is paid. `factors` carries the tower-wide
 * numbers when many units are valued at once; with `noisy` set it overrides the noise check.
 */
export function ownValue(
  state: TowerState,
  unit: Unit,
  noisy?: boolean,
  factors: AppraisalFactors = appraisalFactors(state),
): number {
  const paid = paidPrice(unit);
  if (paid <= 0) return Infinity;
  const used =
    noisy === undefined ? factors : { ...factors, noisy: noisy ? new Set([unit.id]) : new Set<UnitId>() };
  return computeAppraisal(state, unit, used) / paid;
}

export interface UnitValue {
  /** The unit's own value, fair price over price. */
  own: number;
  /** The value after the pull of the worst neighbor. */
  value: number;
  /** The neighbor that pulled the value down, or null. */
  pulledBy: UnitId | null;
}

/**
 * The unit's value for its grade: its own value, pulled 15% of the way toward the lowest own value
 * among the occupied units that touch it when that one is lower. Neighbors count with their own
 * value, before any pull of theirs, so a poor unit lowers the units around it and no further.
 */
export function unitValue(
  state: TowerState,
  unit: Unit,
  noisy?: boolean,
  factors: AppraisalFactors = appraisalFactors(state),
): UnitValue {
  const own = ownValue(state, unit, noisy, factors);
  let worst: Unit | null = null;
  let lowest = own;
  for (const neighbor of touchingUnits(state, unit)) {
    if (!hasOccupants(neighbor)) continue;
    const value = ownValue(state, neighbor, undefined, factors);
    if (value < lowest) {
      lowest = value;
      worst = neighbor;
    }
  }
  if (worst === null || own === Infinity) return { own, value: own, pulledBy: null };
  return { own, value: own - NEIGHBOR_PULL * (own - lowest), pulledBy: worst.id };
}
