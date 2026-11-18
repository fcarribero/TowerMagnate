import {
  EVAL_NOISE,
  STRESS_CAUSES,
  type StressCause,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { unitScore } from './evaluation';
import { isNoisy } from './noise';
import { levelRatio, priceRatio } from './pricing';
import { stressCausesOf } from './trip-ledger';
import { guardedBase, unitBase } from './unit-evaluation';
import { unitNumber } from './units';

/** What a unit's grade is made of right now (stress-evaluation 5.6), for its window. */
export interface EvaluationParts {
  /** Base stress B of the unit's trips, after access control. */
  base: number;
  /** The price adjustment: negative below the appraisal, positive above it. */
  price: number;
  /** True when the price is at or below the minimum level, which grades good whatever else. */
  minimumPrice: boolean;
  /** EVAL_NOISE when a noise source is close, otherwise 0. */
  noise: number;
  /** The cause of stress that weighs most on the unit's own people lately, or null. */
  mainCause: Exclude<StressCause, 'calm'> | null;
}

/** The cause with the largest running total among the people who belong to the unit. */
function mainCauseOf(state: TowerState, unit: Unit): EvaluationParts['mainCause'] {
  const pool = state.people;
  const number = unitNumber(unit.id);
  const totals: Partial<Record<StressCause, number>> = {};
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] !== number) continue;
    const causes = stressCausesOf(pool, slot);
    for (const cause of STRESS_CAUSES) totals[cause] = (totals[cause] ?? 0) + causes[cause];
  }
  let best: EvaluationParts['mainCause'] = null;
  let most = 0;
  for (const cause of STRESS_CAUSES) {
    if (cause === 'calm') continue;
    const value = totals[cause] ?? 0;
    if (value > most) {
      most = value;
      best = cause;
    }
  }
  return best;
}

/** The parts of the unit's score as the grade would add them now (stress-evaluation 5.5). */
export function evaluationParts(state: TowerState, unit: Unit): EvaluationParts {
  const ratio = priceRatio(unit);
  const minimumPrice = ratio <= levelRatio(unit.type, 'minimum');
  return {
    base: guardedBase(state, unit, unitBase(state, unit)),
    price: minimumPrice ? 0 : unitScore(0, ratio, false, unit.type),
    minimumPrice,
    noise: isNoisy(state, unit) ? EVAL_NOISE : 0,
    mainCause: mainCauseOf(state, unit),
  };
}
