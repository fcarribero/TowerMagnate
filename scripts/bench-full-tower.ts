/**
 * Section 9 step budget: one-step `step` calls on a 100-floor tower of 15,000 people, timed
 * from 06:00 to 14:00 of a weekday. Run with `pnpm bench:full-tower`. The result is the median
 * of 3 runs, void if their p95 differs by over 15%.
 *
 * With `--gate --avg-ms <ms> --p95-ms <ms> --p99-ms <ms>` it exits with 1 when a median is over
 * its limit or the result is void. Without `--gate` it only reports.
 */
import os from 'node:os';
import { parseArgs } from 'node:util';
import {
  FULL_TOWER_STEP_BUDGET_MS,
  fullTowerGateFailures,
  medianOf,
  timeFullTowerRuns,
  type FullTowerLimits,
  type FullTowerRun,
} from '@tower-magnate/engine/testing';

const { values: options } = parseArgs({
  options: {
    gate: { type: 'boolean', default: false },
    'avg-ms': { type: 'string' },
    'p95-ms': { type: 'string' },
    'p99-ms': { type: 'string' },
  },
});

function limitFrom(name: 'avg-ms' | 'p95-ms' | 'p99-ms'): number {
  const value = Number(options[name]);
  if (options[name] === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`--gate needs --${name} with a positive number of milliseconds`);
  }
  return value;
}

const limits: FullTowerLimits | null = options.gate
  ? { averageMs: limitFrom('avg-ms'), p95Ms: limitFrom('p95-ms'), p99Ms: limitFrom('p99-ms') }
  : null;

const result = timeFullTowerRuns();
const { runs } = result;
const list = (pick: (run: FullTowerRun) => number) =>
  runs.map((run) => pick(run).toFixed(2)).join(', ');
const median = (pick: (run: FullTowerRun) => number) => medianOf(runs.map(pick)).toFixed(2);
const limitText = (limit: number | undefined) => (limit === undefined ? '' : `, limit ${limit}`);
const machine = `${os.cpus().length} x ${os.cpus()[0]?.model.trim()}, ${os.platform()}`;

console.log(
  [
    `Machine: ${machine}, Node ${process.version}`,
    `People: ${runs[0]?.people}`,
    `Section 9 budget: ${FULL_TOWER_STEP_BUDGET_MS} ms`,
    `Average step ms per run: ${list((run) => run.averageMs)} (median ${median((run) => run.averageMs)}${limitText(limits?.averageMs)})`,
    `p95 step ms per run: ${list((run) => run.p95Ms)} (median ${median((run) => run.p95Ms)}${limitText(limits?.p95Ms)})`,
    `p99 step ms per run: ${list((run) => run.p99Ms)} (median ${median((run) => run.p99Ms)}${limitText(limits?.p99Ms)})`,
    `Max step ms per run: ${list((run) => run.maxMs)}`,
    `Step ms when the same hours run in one call: ${list((run) => run.batchedMs)}`,
  ].join('\n'),
);

if (limits) {
  const failures = fullTowerGateFailures(result, limits);
  for (const failure of failures) console.error(failure);
  console.log(failures.length === 0 ? 'Gate: passed' : 'Gate: failed');
  process.exitCode = failures.length === 0 ? 0 : 1;
} else if (!result.runsAgree) {
  console.error('Runs differ by over 15%, result void.');
}
