import {
  GRADE_FAIR_FROM,
  GRADE_FAIR_FROM_FOUR_STARS,
  GRADE_GOOD_FROM,
  type StarRating,
} from '@tower-magnate/shared';

export type UnitGrade = 'good' | 'fair' | 'poor';

/** The grade of a unit's value, fair price over price (stress-evaluation 6). */
export function gradeOfValue(value: number, stars: StarRating): UnitGrade {
  if (value >= GRADE_GOOD_FROM) return 'good';
  const fairFrom = stars >= 4 ? GRADE_FAIR_FROM_FOUR_STARS : GRADE_FAIR_FROM;
  return value >= fairFrom ? 'fair' : 'poor';
}
