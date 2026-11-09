import { describe, expect, it } from 'vitest';
import { peopleCount } from '../people';
import {
  FULL_TOWER_PEOPLE,
  fullTower,
  fullTowerGateFailures,
  type FullTowerRun,
} from './full-tower';

describe('fullTower', () => {
  it('holds 15,000 people in leased offices on 100 floors', () => {
    const state = fullTower();
    const offices = Object.values(state.units);
    const levels = offices.map((unit) => unit.level);

    expect(peopleCount(state.people)).toBe(FULL_TOWER_PEOPLE);
    expect(Math.max(...levels)).toBeLessThanOrEqual(100);
    expect(offices.every((unit) => unit.lease !== undefined)).toBe(true);
  });
});

function run(averageMs: number, p95Ms: number, p99Ms: number): FullTowerRun {
  return { people: FULL_TOWER_PEOPLE, averageMs, p95Ms, p99Ms, maxMs: p99Ms, batchedMs: 1 };
}

describe('fullTowerGateFailures', () => {
  const limits = { averageMs: 6, p95Ms: 15, p99Ms: 25 };

  it('passes when every median is at or under its limit', () => {
    const runs = [run(5, 14, 30), run(6, 15, 25), run(7, 16, 20)];
    expect(fullTowerGateFailures({ runs, runsAgree: true }, limits)).toEqual([]);
  });

  it('names each median over its limit', () => {
    const runs = [run(6.5, 15.5, 24), run(6.4, 15.2, 24), run(6.6, 15.9, 24)];
    expect(fullTowerGateFailures({ runs, runsAgree: true }, limits)).toEqual([
      'Average median 6.50 ms is over the 6 ms limit.',
      'p95 median 15.50 ms is over the 15 ms limit.',
    ]);
  });

  it('fails runs that disagree even inside the limits', () => {
    const runs = [run(1, 2, 3), run(1, 2, 3), run(1, 2, 3)];
    expect(fullTowerGateFailures({ runs, runsAgree: false }, limits)).toEqual([
      'Runs differ by over 15%, result void.',
    ]);
  });
});
