import {
  EVAL_FAIR_BELOW,
  EVAL_FAIR_BELOW_FROM_FOUR_STARS,
  EVAL_GOOD_BELOW,
  EVAL_NOISE,
  EVAL_PRICE_ADJUST,
  type StarRating,
  type UnitType,
} from '@tower-magnate/shared';
import { byPriceRatio, levelRatio } from './pricing';

export type UnitGrade = 'good' | 'fair' | 'poor';

export interface UnitEvaluationInput {
  /** Average trip stress over the unit's window, 0 when there were no trips. */
  base: number;
  /** Price over appraisal (pricing.ts). */
  priceRatio: number;
  noisy: boolean;
  stars: StarRating;
  /** The unit type whose old price levels place the ratio; an office when left out. */
  type?: UnitType;
}

export interface UnitEvaluation {
  score: number;
  grade: UnitGrade;
}

/** A price at or below the old "minimum" level grades good whatever the stress and noise. */
export function unitScore(
  base: number,
  priceRatio: number,
  noisy: boolean,
  type: UnitType = 'office',
): number {
  if (priceRatio <= levelRatio(type, 'minimum')) {
    return 0;
  }
  const noise = noisy ? EVAL_NOISE : 0;
  const adjust = byPriceRatio(
    type,
    { ...EVAL_PRICE_ADJUST, minimum: EVAL_PRICE_ADJUST.low },
    priceRatio,
  );
  return base + Math.round(adjust) + noise;
}

export function gradeOfScore(score: number, stars: StarRating): UnitGrade {
  const poorFrom = stars >= 4 ? EVAL_FAIR_BELOW_FROM_FOUR_STARS : EVAL_FAIR_BELOW;
  if (score >= poorFrom) {
    return 'poor';
  }
  if (score >= EVAL_GOOD_BELOW) {
    return 'fair';
  }
  return 'good';
}

export function evaluateUnit(input: UnitEvaluationInput): UnitEvaluation {
  const score = unitScore(input.base, input.priceRatio, input.noisy, input.type);
  return { score, grade: gradeOfScore(score, input.stars) };
}
