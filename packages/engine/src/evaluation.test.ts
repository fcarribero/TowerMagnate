import type { StarRating } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { gradeOfValue } from './evaluation';

describe('gradeOfValue', () => {
  it.each<[number, StarRating, string]>([
    [Infinity, 1, 'good'],
    [1.3, 3, 'good'],
    [1.0, 3, 'good'],
    [0.999, 3, 'fair'],
    [0.8, 3, 'fair'],
    [0.799, 3, 'poor'],
    [0.75, 3, 'poor'],
    [0.75, 4, 'fair'],
    [0.7, 4, 'fair'],
    [0.699, 4, 'poor'],
    [0.75, 6, 'fair'],
    [0, 6, 'poor'],
  ])('value %d at %i stars is %s', (value, stars, expected) => {
    expect(gradeOfValue(value, stars)).toBe(expected);
  });
});
