import {
  EVAL_FAIR_BELOW,
  EVAL_FAIR_BELOW_FROM_FOUR_STARS,
  EVAL_GOOD_BELOW,
  EVAL_NOISE,
  EVAL_PRICE_ADJUST,
  type PriceLevel,
  type StarRating,
} from '@tower-magnate/shared';

export type UnitGrade = 'good' | 'fair' | 'poor';

export interface UnitEvaluationInput {
  /** Average trip stress over the unit's window, 0 when there were no trips. */
  base: number;
  price: PriceLevel;
  noisy: boolean;
  stars: StarRating;
}

export interface UnitEvaluation {
  score: number;
  grade: UnitGrade;
}

export function unitScore(base: number, price: PriceLevel, noisy: boolean): number {
  if (price === 'minimum') {
    return 0;
  }
  const noise = noisy ? EVAL_NOISE : 0;
  return base + EVAL_PRICE_ADJUST[price] + noise;
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
  const score = unitScore(input.base, input.price, input.noisy);
  return { score, grade: gradeOfScore(score, input.stars) };
}
