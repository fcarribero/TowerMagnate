import type { PriceLevel, StarRating } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { gradeOfValue, unitScore } from './evaluation';
import { levelRatio } from './pricing';

describe('unitScore', () => {
  it.each<[PriceLevel, boolean, number]>([
    ['high', false, 101],
    ['high', true, 161],
    ['normal', false, 71],
    ['normal', true, 131],
    ['low', false, 41],
    ['low', true, 101],
    ['minimum', false, 0],
    ['minimum', true, 0],
  ])('price %s with noise %s gives %i for base 71', (price, noisy, expected) => {
    expect(unitScore(71, levelRatio('office', price), noisy)).toBe(expected);
  });

  it('can go below zero at low price', () => {
    expect(unitScore(10, levelRatio('office', 'low'), false)).toBe(-20);
  });
});

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
