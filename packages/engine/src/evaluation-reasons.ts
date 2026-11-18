import {
  STRESS_CAUSES,
  type StressCause,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { appraisalFactors, computeAppraisal } from './appraisal';
import { isNoisy } from './noise';
import { stressCausesOf } from './trip-ledger';
import { unitNumber } from './units';
import { occupantScore, paidPrice, unitValue } from './unit-value';

/** What a unit's grade is made of right now (stress-evaluation 5.6), for its window. */
export interface EvaluationParts {
  /** Stress score of the unit's occupants, 0 to 10, noise included. */
  occupantScore: number;
  /** The fair price now, which the score sets. */
  fairPrice: number;
  /** What the occupants pay. */
  price: number;
  noisy: boolean;
  /** The cause of stress that weighs most on the unit's own people lately, or null. */
  mainCause: Exclude<StressCause, 'calm'> | null;
  /** The worse neighbor that pulls the grade down, or null. */
  pulledBy: UnitId | null;
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

/** The parts of the unit's grade as it would be worked out now (stress-evaluation 5.5). */
export function evaluationParts(state: TowerState, unit: Unit): EvaluationParts {
  const noisy = isNoisy(state, unit);
  const factors = appraisalFactors(state);
  return {
    occupantScore: occupantScore(state, unit, noisy, factors.towerScore),
    fairPrice: computeAppraisal(state, unit, { ...factors, noisy: noisy ? new Set([unit.id]) : new Set() }),
    price: paidPrice(unit),
    noisy,
    mainCause: mainCauseOf(state, unit),
    pulledBy: unitValue(state, unit, noisy, factors).pulledBy,
  };
}
