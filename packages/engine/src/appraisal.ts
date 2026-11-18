import {
  APPRAISAL_AMENITY_PERCENT_CAP,
  APPRAISAL_AMENITY_PERCENT_EACH,
  APPRAISAL_AMENITY_TYPES,
  APPRAISAL_RANGE_PERCENT,
  APPRAISAL_STAR_PERCENT,
  basePrice,
  type TowerState,
  type Unit,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import type { LevelIndex } from './neighbors';
import { noisyUnitIds } from './noise';
import { unitNumber } from './units';
import { occupantPercent, occupantScore, towerScore } from './unit-value';
import { writableUnit } from './step-copy';

/** Tower-wide numbers every appraisal of one day shares. */
export interface AppraisalFactors {
  amenities: number;
  /** Stress score of the whole tower, used by units with no trips of their own. */
  towerScore: number;
  /** Units with a noise source close by; worked out per unit when left out. */
  noisy?: ReadonlySet<UnitId>;
  /** Own values already worked out in this pass, so a unit's neighbors do not redo them. */
  ownValues?: Map<UnitId, number>;
  /** Evaluated units by level, so neighbor lookups do not scan every unit. */
  levels?: LevelIndex;
}

export function appraisalFactors(state: TowerState): AppraisalFactors {
  let amenities = 0;
  for (const unit of Object.values(state.units)) {
    if (APPRAISAL_AMENITY_TYPES.includes(unit.type)) amenities += 1;
  }
  return { amenities, towerScore: towerScore(state) };
}

/** A unit of the tower, or only the type of one still to be built. */
export type AppraisedUnit = Unit | { type: UnitType };

function scoreOf(state: TowerState, unit: AppraisedUnit, factors: AppraisalFactors): number {
  if (!('id' in unit) || !Object.hasOwn(state.units, unit.id)) return factors.towerScore;
  const noisy = factors.noisy ? factors.noisy.has(unit.id) : undefined;
  return occupantScore(state, unit, noisy, factors.towerScore);
}

/**
 * The fair price of a priced unit: its base price moved by the tower's stars, the amenities in
 * the tower and the stress score of the unit's occupants (the tower's for a unit still to be
 * built), kept inside the appraisal range. Whole money; 0 for a unit with no price.
 */
export function computeAppraisal(
  state: TowerState,
  unit: AppraisedUnit,
  factors: AppraisalFactors = appraisalFactors(state),
): number {
  const base = basePrice(unit.type);
  if (base === 0) return 0;
  const stars = (state.stars - 1) * APPRAISAL_STAR_PERCENT;
  const amenities = Math.min(
    factors.amenities * APPRAISAL_AMENITY_PERCENT_EACH,
    APPRAISAL_AMENITY_PERCENT_CAP,
  );
  const percent = 100 + stars + amenities + occupantPercent(scoreOf(state, unit, factors));
  const clamped = Math.min(
    APPRAISAL_RANGE_PERCENT.max,
    Math.max(APPRAISAL_RANGE_PERCENT.min, percent),
  );
  return Math.round((base * clamped) / 100);
}

/** Starts a new unit at its current appraisal, with the price set to it. */
export function startAtAppraisal(state: TowerState, unit: Unit): void {
  const appraisal = computeAppraisal(state, unit);
  unit.appraisal = appraisal;
  unit.price = appraisal;
}

/** Recomputes the appraisal of every priced unit, in unit order. Runs at 00:00 after the grades. */
export function storeDailyAppraisals(state: TowerState): void {
  const factors = { ...appraisalFactors(state), noisy: noisyUnitIds(state) };
  const units = Object.values(state.units).sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of units) {
    const appraisal = computeAppraisal(state, unit, factors);
    if (appraisal !== unit.appraisal) writableUnit(state, unit).appraisal = appraisal;
  }
}
