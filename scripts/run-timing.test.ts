import { describe, expect, it } from 'vitest';
import { medianIfRunsAgree } from './run-timing';

describe('timing agreement', () => {
  it('uses the median when the runs are within 15% of each other', () => {
    expect(medianIfRunsAgree([20, 22, 23])).toBe(22);
  });

  it('voids the result when the slowest run is more than 15% above the fastest', () => {
    expect(medianIfRunsAgree([20, 22, 24])).toBeNull();
  });
});
