import type { PriceLevel, StarRating } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { evaluateUnit, gradeLabel, gradeOfScore, unitScore } from './evaluation';

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
    expect(unitScore(71, price, noisy)).toBe(expected);
  });

  it('can go below zero at low price', () => {
    expect(unitScore(10, 'low', false)).toBe(-20);
  });
});

describe('gradeOfScore', () => {
  it.each<[number, StarRating, string]>([
    [0, 3, 'good'],
    [89, 3, 'good'],
    [90, 3, 'fair'],
    [179, 3, 'fair'],
    [180, 3, 'poor'],
    [239, 3, 'poor'],
    [240, 3, 'poor'],
    [89, 1, 'good'],
    [180, 1, 'poor'],
    [89, 4, 'good'],
    [90, 4, 'fair'],
    [180, 4, 'fair'],
    [239, 4, 'fair'],
    [240, 4, 'poor'],
    [239, 5, 'fair'],
    [240, 5, 'poor'],
    [239, 6, 'fair'],
    [240, 6, 'poor'],
  ])('score %i at %i stars is %s', (score, stars, expected) => {
    expect(gradeOfScore(score, stars)).toBe(expected);
  });
});

describe('evaluateUnit', () => {
  it('matches the office example at 3 stars with noise', () => {
    const grade = (price: PriceLevel) => evaluateUnit({ base: 71, price, noisy: true, stars: 3 });
    expect(grade('normal')).toEqual({ score: 131, grade: 'fair' });
    expect(grade('high')).toEqual({ score: 161, grade: 'fair' });
    expect(grade('low')).toEqual({ score: 101, grade: 'fair' });
    expect(grade('minimum')).toEqual({ score: 0, grade: 'good' });
  });

  it('matches the office example without noise', () => {
    expect(evaluateUnit({ base: 71, price: 'normal', noisy: false, stars: 3 }).grade).toBe('good');
    expect(evaluateUnit({ base: 71, price: 'high', noisy: false, stars: 3 }).grade).toBe('fair');
  });

  it('is poor at 3 stars and fair at 4 for base 125, high price, noise', () => {
    expect(evaluateUnit({ base: 125, price: 'high', noisy: true, stars: 3 })).toEqual({
      score: 215,
      grade: 'poor',
    });
    expect(evaluateUnit({ base: 125, price: 'high', noisy: true, stars: 4 })).toEqual({
      score: 215,
      grade: 'fair',
    });
  });

  it('gives good at minimum price whatever the base, noise and stars', () => {
    expect(evaluateUnit({ base: 900, price: 'minimum', noisy: true, stars: 1 })).toEqual({
      score: 0,
      grade: 'good',
    });
  });

  it('matches the condo example at the 180 line', () => {
    expect(evaluateUnit({ base: 150, price: 'low', noisy: true, stars: 3 })).toEqual({
      score: 180,
      grade: 'poor',
    });
    expect(evaluateUnit({ base: 150, price: 'low', noisy: true, stars: 4 })).toEqual({
      score: 180,
      grade: 'fair',
    });
  });
});

describe('gradeLabel', () => {
  it('shows Spanish labels and Sin evaluar for no grade', () => {
    expect(gradeLabel('good')).toBe('Buena');
    expect(gradeLabel('fair')).toBe('Regular');
    expect(gradeLabel('poor')).toBe('Mala');
    expect(gradeLabel(null)).toBe('Sin evaluar');
  });
});
