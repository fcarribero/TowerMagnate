import { describe, expect, it } from 'vitest';
import { timeWeekdayBench, weekdayProblems } from './transport-scenario';
import type { WeekdayRun } from './transport-scenario';

function run(averageMs: number, p99Ms: number, movingAt3am = 0): WeekdayRun {
  return { averageMs, p99Ms, systemAverageMs: [], movingAt3am, mostMoving: 0, people: 3000 };
}

const quiet = [run(0.26, 1.35), run(0.26, 1.59), run(0.265, 1.4)];

describe('weekday benchmark verdict', () => {
  it('does not void the result when only the p99 differs by over 15%', () => {
    expect(weekdayProblems(quiet)).toEqual([]);
  });

  it('voids the result when the average differs by over 15%', () => {
    const noisy = [run(0.2, 1), run(0.26, 1), run(0.3, 1)];
    expect(weekdayProblems(noisy)).toHaveLength(1);
  });

  it('fails when the median average is over 1 ms', () => {
    expect(weekdayProblems([run(1.1, 1), run(1.1, 1), run(1.1, 1)])).toEqual([
      'Average step time is over budget.',
    ]);
  });

  it('fails when the median p99 is over 5 ms', () => {
    expect(weekdayProblems([run(0.3, 5.5), run(0.3, 5.6), run(0.3, 5.4)])).toEqual([
      'p99 step time is over budget.',
    ]);
  });

  it('fails when people are on the move at 03:00', () => {
    expect(weekdayProblems([run(0.3, 1, 2), run(0.3, 1), run(0.3, 1)])).toHaveLength(1);
  });

  it('runs once and passes without a retry when the first result is good', () => {
    let calls = 0;
    const result = timeWeekdayBench(() => (calls++, quiet));
    expect(calls).toBe(1);
    expect(result.problems).toEqual([]);
  });

  it('retries once and passes when the second result is good', () => {
    const slow = [run(1.5, 1), run(1.5, 1), run(1.5, 1)];
    const results = [slow, quiet];
    let calls = 0;
    const result = timeWeekdayBench(() => results[calls++] as WeekdayRun[]);
    expect(calls).toBe(2);
    expect(result.problems).toEqual([]);
  });

  it('fails on the retry when the budget is still missed, and does not retry twice', () => {
    const slow = [run(1.5, 1), run(1.5, 1), run(1.5, 1)];
    let calls = 0;
    const result = timeWeekdayBench(() => (calls++, slow));
    expect(calls).toBe(2);
    expect(result.problems).toEqual(['Average step time is over budget.']);
  });
});
