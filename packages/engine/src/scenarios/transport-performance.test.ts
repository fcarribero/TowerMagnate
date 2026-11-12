import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { timeWeekdayBench, weekdayReport } from '../testing';

// A weekday takes minutes, so the unit suite skips it. `pnpm bench:transport` runs the same scenario.
const describePerf = process.env.TM_PERF ? describe : describe.skip;

describePerf('scenario: 60-floor tower, 3,000 people, 12 shafts', () => {
  it('runs one weekday inside the step time budget and leaves nobody on the move at 03:00', () => {
    const { runs, problems } = timeWeekdayBench();
    const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${os.platform()}`;
    console.info(weekdayReport(runs, machine, process.version));

    expect(runs[0]?.people).toBe(3000);
    expect(problems).toEqual([]);
  }, 900_000);
});
