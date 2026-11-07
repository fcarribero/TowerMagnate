import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './index';

describe('engine step constants', () => {
  it('fits 8640 ten-second steps in one game day', () => {
    expect(STEPS_PER_DAY).toBe(8640);
  });
});
