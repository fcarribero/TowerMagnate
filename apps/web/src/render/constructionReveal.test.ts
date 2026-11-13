import { describe, expect, it } from 'vitest';
import {
  BUILD_MS,
  buildProgress,
  columnRuns,
  revealedHeight,
  runDurationMs,
  staggerFor,
} from './constructionReveal';

describe('buildProgress', () => {
  it('goes from 0 to 1 over the build time, fast at first', () => {
    expect(buildProgress(0)).toBe(0);
    expect(buildProgress(BUILD_MS / 2)).toBeGreaterThan(0.5);
    expect(buildProgress(BUILD_MS)).toBe(1);
    expect(buildProgress(BUILD_MS * 3)).toBe(1);
    expect(buildProgress(-50)).toBe(0);
  });
});

describe('revealedHeight', () => {
  it('grows in steps of 2 px and ends at the full height', () => {
    expect(revealedHeight(32, 0)).toBe(0);
    expect(revealedHeight(32, 0.51)).toBe(16);
    expect(revealedHeight(32, 0.99)).toBe(30);
    expect(revealedHeight(32, 1)).toBe(32);
  });
});

describe('floor runs', () => {
  it('staggers neighbouring tiles but never past half a second in total', () => {
    expect(staggerFor(1)).toBe(0);
    expect(staggerFor(5)).toBe(24);
    expect(staggerFor(100) * 99).toBeLessThanOrEqual(500);
    expect(runDurationMs(1)).toBe(BUILD_MS);
    expect(runDurationMs(100)).toBeLessThanOrEqual(BUILD_MS + 500);
  });

  it('splits columns into runs of consecutive columns', () => {
    expect(columnRuns([2, 3, 4, 9, 11, 12])).toEqual([
      { from: 2, to: 4 },
      { from: 9, to: 9 },
      { from: 11, to: 12 },
    ]);
  });
});
