/**
 * TM-102 evaluation benchmark: the 00:00 grades of 300 offices, condos and shops, each with a
 * week of trips. Run with `pnpm bench:evaluation`. Exits with 1 when the median of 3 runs is
 * over 5 ms.
 */
import {
  EVALUATED_UNITS,
  MAX_DAILY_GRADES_MS,
  medianOf,
  timeDailyGrades,
} from '@tower-magnate/engine/testing';

const runs = timeDailyGrades();
const median = medianOf(runs);
const list = runs.map((ms) => ms.toFixed(3)).join(', ');

console.log(`Daily grades of ${EVALUATED_UNITS} units, ms per run: ${list}`);
console.log(`Median ${median.toFixed(3)} ms (budget ${MAX_DAILY_GRADES_MS} ms)`);

if (median > MAX_DAILY_GRADES_MS) console.error('Daily grades are over budget.');
process.exitCode = median <= MAX_DAILY_GRADES_MS ? 0 : 1;
