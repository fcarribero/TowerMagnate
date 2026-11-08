/**
 * TM-100 transport scenario: one weekday of the 60-floor tower with 3,000 people and 12 shafts.
 * Run with `pnpm bench:transport`. It takes minutes, so the unit suite skips it.
 * Prints the timing summary with the cost of each system. Exits with 1 when the median average
 * step is over 1.0 ms, the median p99 is over 5 ms, anyone is on the move at 03:00, or the runs
 * differ by over 15%.
 */
import os from 'node:os';
import {
  MAX_AVERAGE_MS,
  MAX_P99_MS,
  MAX_SPREAD,
  medianOf,
  spreadOf,
  timeThreeRuns,
  weekdayReport,
} from '@tower-magnate/engine/testing';

const runs = timeThreeRuns();
const averages = runs.map((run) => run.averageMs);
const p99s = runs.map((run) => run.p99Ms);
const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${os.platform()}`;
console.log(weekdayReport(runs, machine, process.version));

const agree = spreadOf(averages) <= MAX_SPREAD && spreadOf(p99s) <= MAX_SPREAD;
const inBudget = medianOf(averages) <= MAX_AVERAGE_MS && medianOf(p99s) <= MAX_P99_MS;
const quietAt3am = runs.every((run) => run.movingAt3am === 0);
if (!agree) console.error('Runs differ by over 15%, result void.');
if (!inBudget) console.error('Step time is over budget (owned by TM-222).');
if (!quietAt3am) console.error('People are still on the move at 03:00.');
process.exitCode = agree && inBudget && quietAt3am ? 0 : 1;
