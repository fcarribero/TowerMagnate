import { describe, expect, it } from 'vitest';
import { peopleCount } from '../people';
import {
  FULL_TOWER_PEOPLE,
  fullTower,
  fullTowerGateFailures,
  fullTowerGateWarnings,
  type FullTowerRun,
  type SystemTiming,
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

function timing(name: string, p95Ms: number): SystemTiming {
  return { name, averageMs: p95Ms / 2, p95Ms, p99Ms: p95Ms, maxMs: p95Ms };
}

function run(averageMs: number, p95Ms: number, p99Ms: number, trekP95Ms = 1): FullTowerRun {
  return {
    people: FULL_TOWER_PEOPLE,
    averageMs,
    p95Ms,
    p99Ms,
    maxMs: p99Ms,
    batchedMs: 1,
    systems: [timing('trek', trekP95Ms), timing('office routine', 1)],
  };
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

  it('names a peak system whose median p95 is over the system limit', () => {
    const runs = [run(1, 2, 3, 2.4), run(1, 2, 3, 2.7), run(1, 2, 3, 2.6)];
    const withSystems = { ...limits, systemP95Ms: 2.5 };
    expect(fullTowerGateFailures({ runs, runsAgree: true }, withSystems)).toEqual([
      'trek p95 median 2.60 ms is over the 2.5 ms limit.',
    ]);
  });

  it('reports a peak system between the report and failing limits without failing', () => {
    const runs = [run(1, 2, 3, 2.6), run(1, 2, 3, 2.8), run(1, 2, 3, 2.7)];
    const withSystems = { ...limits, systemP95Ms: 3, systemP95ReportMs: 2.5 };
    expect(fullTowerGateFailures({ runs, runsAgree: true }, withSystems)).toEqual([]);
    expect(fullTowerGateWarnings({ runs, runsAgree: true }, withSystems)).toEqual([
      'trek p95 median 2.70 ms is over 2.5 ms.',
    ]);
  });

  it('leaves the systems out without a system limit', () => {
    const runs = [run(1, 2, 3, 9), run(1, 2, 3, 9), run(1, 2, 3, 9)];
    expect(fullTowerGateFailures({ runs, runsAgree: true }, limits)).toEqual([]);
  });
});
