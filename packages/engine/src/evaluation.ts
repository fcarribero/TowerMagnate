import {
  GRADE_FAIR_FROM,
  GRADE_FAIR_FROM_FOUR_STARS,
  GRADE_GOOD_FROM,
  EVAL_NOISE,
  EVAL_PRICE_ADJUST,
  type StarRating,
  type UnitType,
} from '@tower-magnate/shared';
import { byPriceRatio, levelRatio } from './pricing';

export type UnitGrade = 'good' | 'fair' | 'poor';

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

/** The grade of a unit's value, fair price over price (stress-evaluation 6). */
export function gradeOfValue(value: number, stars: StarRating): UnitGrade {
  if (value >= GRADE_GOOD_FROM) return 'good';
  const fairFrom = stars >= 4 ? GRADE_FAIR_FROM_FOUR_STARS : GRADE_FAIR_FROM;
  return value >= fairFrom ? 'fair' : 'poor';
}
