import { describe, expect, it } from 'vitest';
import { SECONDS_PER_STEP, STEPS_PER_DAY } from './clock';

describe('engine step constants', () => {
  it('uses 10 game seconds per step', () => {
    expect(SECONDS_PER_STEP).toBe(10);
  });

  it('fits 8640 steps in one game day', () => {
    expect(STEPS_PER_DAY).toBe(8640);
  });
});
