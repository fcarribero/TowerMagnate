import { describe, expect, it } from 'vitest';
import { calibrateCpu, normalizeLag, slowdownFactor } from './cpu-speed';

describe('slowdownFactor', () => {
  it('is above 1 on a machine slower than the reference', () => {
    expect(slowdownFactor(150, 100)).toBe(1.5);
    expect(slowdownFactor(80, 100)).toBe(0.8);
  });
});

describe('normalizeLag', () => {
  it('scales a lag to the reference runner', () => {
    expect(normalizeLag(105, 1.5)).toBeCloseTo(70);
    expect(normalizeLag(56, 0.8)).toBeCloseTo(70);
  });
});

describe('calibrateCpu', () => {
  it('returns a positive time', () => {
    expect(calibrateCpu()).toBeGreaterThan(0);
  });
});
