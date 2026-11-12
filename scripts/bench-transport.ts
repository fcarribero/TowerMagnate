/**
 * TM-100 transport scenario: one weekday of the 60-floor tower with 3,000 people and 12 shafts.
 * Run with `pnpm bench:transport`. It takes minutes, so the unit suite skips it.
 * Prints the timing summary with the cost of each system. Exits with 1 when the median average
 * step is over 1.0 ms, the median p99 is over 5 ms, anyone is on the move at 03:00, or the average
 * differs by over 15% between runs. A failing benchmark is run once more before the exit code is set.
 */
import os from 'node:os';
import { timeWeekdayBench, weekdayReport } from '@tower-magnate/engine/testing';

const { runs, problems } = timeWeekdayBench();
const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${os.platform()}`;
console.log(weekdayReport(runs, machine, process.version));
for (const problem of problems) console.error(problem);
process.exitCode = problems.length === 0 ? 0 : 1;
