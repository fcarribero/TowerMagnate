import type { PriceLevel, StarRating } from '@tower-magnate/shared';

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

export const NOISE_PENALTY = 60;

const PRICE_ADJUSTMENT: Readonly<Record<Exclude<PriceLevel, 'minimum'>, number>> = {
  high: 30,
  normal: 0,
  low: -30,
};

const FAIR_FROM = 90;
const POOR_FROM_BELOW_FOUR_STARS = 180;
const POOR_FROM_AT_FOUR_STARS = 240;

const GRADE_LABELS: Readonly<Record<UnitGrade, string>> = {
  good: 'Buena',
  fair: 'Regular',
  poor: 'Mala',
};

export function unitScore(base: number, price: PriceLevel, noisy: boolean): number {
  if (price === 'minimum') {
    return 0;
  }
  const noise = noisy ? NOISE_PENALTY : 0;
  return base + PRICE_ADJUSTMENT[price] + noise;
}

export function gradeOfScore(score: number, stars: StarRating): UnitGrade {
  const poorFrom = stars >= 4 ? POOR_FROM_AT_FOUR_STARS : POOR_FROM_BELOW_FOUR_STARS;
  if (score >= poorFrom) {
    return 'poor';
  }
  if (score >= FAIR_FROM) {
    return 'fair';
  }
  return 'good';
}

export function evaluateUnit(input: UnitEvaluationInput): UnitEvaluation {
  const score = unitScore(input.base, input.price, input.noisy);
  return { score, grade: gradeOfScore(score, input.stars) };
}

/** A unit with no stored grade shows "Sin evaluar". */
export function gradeLabel(grade: UnitGrade | null): string {
  return grade === null ? 'Sin evaluar' : GRADE_LABELS[grade];
}
