import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  MAX_AVERAGE_MS,
  MAX_P99_MS,
  MAX_SPREAD,
  medianOf,
  spreadOf,
  timeThreeRuns,
  weekdayReport,
} from '../testing';

// A weekday takes minutes, so the unit suite skips it. `pnpm bench:transport` runs the same scenario.
const describePerf = process.env.TM_PERF ? describe : describe.skip;

describePerf('scenario: 60-floor tower, 3,000 people, 12 shafts', () => {
  it('runs one weekday inside the step time budget and leaves nobody on the move at 03:00', () => {
    const runs = timeThreeRuns();
    const averages = runs.map((run) => run.averageMs);
    const p99s = runs.map((run) => run.p99Ms);
    const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${os.platform()}`;
    console.info(weekdayReport(runs, machine, process.version));

    expect(runs[0]?.people).toBe(3000);
    expect(spreadOf(averages)).toBeLessThanOrEqual(MAX_SPREAD);
    expect(spreadOf(p99s)).toBeLessThanOrEqual(MAX_SPREAD);
    expect(medianOf(averages)).toBeLessThanOrEqual(MAX_AVERAGE_MS);
    expect(medianOf(p99s)).toBeLessThanOrEqual(MAX_P99_MS);
    for (const run of runs) expect(run.movingAt3am).toBe(0);
  }, 900_000);
});
