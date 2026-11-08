import { describe, expect, it } from 'vitest';
import { agreeWithin, combineRuns, percentile, summarizeTicks, type LoadRun } from './load-stats';

function run(p95LagMs: number, cpuPercent: number, p50LagMs = 1): LoadRun {
  return { ticks: 6000, p50LagMs, p95LagMs, maxLagMs: p95LagMs * 2, cpuPercent };
}

describe('percentile', () => {
  it('takes the nearest rank', () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);

    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(95);
    expect(percentile(values, 1)).toBe(100);
  });

  it('is NaN without values', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('agreeWithin', () => {
  it('accepts runs up to 15% above the lowest', () => {
    expect(agreeWithin([20, 22, 23])).toBe(true);
  });

  it('rejects runs further apart', () => {
    expect(agreeWithin([20, 22, 23.1])).toBe(false);
  });
});

describe('summarizeTicks', () => {
  it('reports lag percentiles and CPU as a share of one core', () => {
    const summary = summarizeTicks([4, 1, 3, 2], 300_000, 1_000);

    expect(summary).toEqual({ ticks: 4, p50LagMs: 2, p95LagMs: 4, maxLagMs: 4, cpuPercent: 30 });
  });
});

describe('combineRuns', () => {
  it('takes the median of each figure', () => {
    const result = combineRuns([run(10, 30, 2), run(11, 31, 1), run(10.5, 32, 3)]);

    expect(result.p95LagMs).toBe(10.5);
    expect(result.cpuPercent).toBe(31);
    expect(result.p50LagMs).toBe(2);
    expect(result.runsAgree).toBe(true);
  });

  it('voids the result when p95 lag disagrees', () => {
    expect(combineRuns([run(10, 30), run(12, 30), run(10, 30)]).runsAgree).toBe(false);
  });

  it('voids the result when CPU disagrees', () => {
    expect(combineRuns([run(10, 30), run(10, 40), run(10, 30)]).runsAgree).toBe(false);
  });
});
