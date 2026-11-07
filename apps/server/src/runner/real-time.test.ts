import { STEPS_PER_DAY } from '@tower-magnate/engine';
import { describe, expect, it } from 'vitest';
import { REAL_MS_PER_GAME_DAY, stepsForElapsed } from './real-time';

describe('real time pacing', () => {
  it('fits one game day into 15 real minutes', () => {
    expect(stepsForElapsed(REAL_MS_PER_GAME_DAY)).toBe(STEPS_PER_DAY);
  });

  it('runs at 9.6 steps per real second', () => {
    expect(stepsForElapsed(1000)).toBe(9);
    expect(stepsForElapsed(10_000)).toBe(96);
  });

  it('counts only whole steps', () => {
    expect(stepsForElapsed(104)).toBe(0);
    expect(stepsForElapsed(105)).toBe(1);
  });

  it('gives no steps for no time or a clock that went back', () => {
    expect(stepsForElapsed(0)).toBe(0);
    expect(stepsForElapsed(-500)).toBe(0);
  });
});
