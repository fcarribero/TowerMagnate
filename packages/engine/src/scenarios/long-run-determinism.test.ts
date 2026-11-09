import { beforeAll, describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { deserializeState } from '../serialization';
import {
  LONG_RUN_DAYS,
  LONG_RUN_SEED,
  LONG_RUN_SNAPSHOT_DAY,
  longRunTower,
  playLongRun,
  resumeLongRun,
  type LongRun,
} from '../testing';

const RUN_TIMEOUT_MS = 60_000;

describe('scenario: 100 floors played for 5 game weeks', () => {
  let first: LongRun;
  let second: LongRun;

  beforeAll(() => {
    first = playLongRun(longRunTower(), 0);
    second = playLongRun(longRunTower(), 0);
  }, RUN_TIMEOUT_MS);

  it('plays 35 days and accepts every scripted command', () => {
    expect(first.dailyHashes).toHaveLength(LONG_RUN_DAYS);
    expect(first.results.length).toBeGreaterThan(0);
    expect(first.results.filter((result) => !result.ok)).toEqual([]);
  });

  it('grows a tower that changes every day', () => {
    expect(new Set(first.dailyHashes).size).toBe(LONG_RUN_DAYS);
    expect(first.state.stars).toBeGreaterThanOrEqual(2);
  });

  it('gives the same state hash at the end of every day for the same seed', () => {
    expect(second.dailyHashes).toEqual(first.dailyHashes);
    expect(hashState(second.state)).toBe(hashState(first.state));
  });

  it('restores the week 2 snapshot to the same hash', () => {
    const snapshot = first.snapshot ?? '';
    expect(snapshot).not.toBe('');
    expect(hashState(deserializeState(snapshot))).toBe(
      first.dailyHashes[LONG_RUN_SNAPSHOT_DAY - 1],
    );
  });

  it(
    'plays on from the restored snapshot to the same daily hashes',
    () => {
      const resumed = resumeLongRun(first.snapshot ?? '');
      expect(resumed.dailyHashes).toEqual(first.dailyHashes.slice(LONG_RUN_SNAPSHOT_DAY));
      expect(resumed.results).toEqual(
        first.results.filter((result) => result.step >= resumedFromStep(first)),
      );
    },
    RUN_TIMEOUT_MS,
  );

  it('gives a different hash for another seed', () => {
    const otherSeed = playLongRun(longRunTower(LONG_RUN_SEED + 1), 0, 1);
    expect(otherSeed.dailyHashes[0]).not.toBe(first.dailyHashes[0]);
  });
});

function resumedFromStep(run: LongRun): number {
  return deserializeState(run.snapshot ?? '').step;
}
