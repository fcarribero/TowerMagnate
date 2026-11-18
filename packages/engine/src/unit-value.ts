import {
  EVAL_NOISE_SCORE,
  FAIR_PRICE_STRESS_PERCENT,
  STRESS_SCORE_MAX,
  stressScore,
  TOWER_SCORE_DEFAULT,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
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
