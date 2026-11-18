import { describe, expect, it } from 'vitest';
import { stressScore } from './stress-score';

describe('stressScore', () => {
  it('is 0 with no stress', () => {
    expect(stressScore(0)).toBe(0);
    expect(stressScore(-5)).toBe(0);
  });

  it('spreads the usual trip lengths over the scale', () => {
    expect(stressScore(30)).toBeCloseTo(1.535, 2);
    expect(stressScore(90)).toBeCloseTo(3.935, 2);
    expect(stressScore(180)).toBeCloseTo(6.321, 2);
    expect(stressScore(540)).toBeCloseTo(9.502, 2);
  });

  it('never goes over 10', () => {
    expect(stressScore(1e9)).toBeLessThanOrEqual(10);
  });
});
