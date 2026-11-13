import {
  APPRAISAL_AMENITY_PERCENT_CAP,
  APPRAISAL_AMENITY_PERCENT_EACH,
  APPRAISAL_AMENITY_TYPES,
  APPRAISAL_GRADE_PERCENT,
  APPRAISAL_RANGE_PERCENT,
  APPRAISAL_STAR_PERCENT,
  APPRAISAL_STRESS_PERCENT,
  basePrice,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { unitNumber } from './units';
import { writableUnit } from './step-copy';

/** Tower-wide numbers every appraisal of one day shares. */
export interface AppraisalFactors {
  amenities: number;
  /** Average trip stress of the trips filed in the ledger, in steps; null with no trips. */
  averageStress: number | null;
}

function averageLedgerStress(state: TowerState): number | null {
  let sum = 0;
  let count = 0;
  for (const flat of Object.values(state.tripLedger)) {
    for (let at = 1; at < flat.length; at += 2) {
      sum += flat[at] as number;
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

export function appraisalFactors(state: TowerState): AppraisalFactors {
  let amenities = 0;
  for (const unit of Object.values(state.units)) {
    if (APPRAISAL_AMENITY_TYPES.includes(unit.type)) amenities += 1;
  }
  return { amenities, averageStress: averageLedgerStress(state) };
}

/** Percent the average stress adds (see APPRAISAL_STRESS_PERCENT). */
function stressPercent(averageStress: number | null): number {
  if (averageStress === null) return 0;
  const { best, neutralAt, worst, worstAt } = APPRAISAL_STRESS_PERCENT;
  if (averageStress <= neutralAt) return best * (1 - averageStress / neutralAt);
  const share = (Math.min(averageStress, worstAt) - neutralAt) / (worstAt - neutralAt);
  return worst * share;
}

/**
 * What the tower thinks a priced unit is worth: its base price moved by the unit's grade, the
 * tower's stars, the amenities in the tower and the average stress of its people, kept inside
 * the appraisal range. Whole money; 0 for a unit with no price.
 */
export function computeAppraisal(
  state: TowerState,
  unit: Pick<Unit, 'type' | 'evaluation'>,
  factors: AppraisalFactors = appraisalFactors(state),
): number {
  const base = basePrice(unit.type);
  if (base === 0) return 0;
  const grade = APPRAISAL_GRADE_PERCENT[unit.evaluation ?? 'ungraded'] - 100;
  const stars = (state.stars - 1) * APPRAISAL_STAR_PERCENT;
  const amenities = Math.min(
    factors.amenities * APPRAISAL_AMENITY_PERCENT_EACH,
    APPRAISAL_AMENITY_PERCENT_CAP,
  );
  const percent = 100 + grade + stars + amenities + stressPercent(factors.averageStress);
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
  const factors = appraisalFactors(state);
  const units = Object.values(state.units).sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of units) {
    const appraisal = computeAppraisal(state, unit, factors);
    if (appraisal !== unit.appraisal) writableUnit(state, unit).appraisal = appraisal;
  }
}
