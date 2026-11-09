/**
 * Section 9 step budget: one-step `step` calls on a 100-floor tower of 15,000 people, timed
 * from 06:00 to 14:00 of a weekday. Run with `pnpm bench:full-tower`. The result is the median
 * of 3 runs, void if their p95 differs by over 15%. Exits with 1 when the median p95 is over
 * 5 ms or the result is void.
 */
import os from 'node:os';
import {
  FULL_TOWER_STEP_BUDGET_MS,
  medianOf,
  timeFullTowerRuns,
  type FullTowerRun,
} from '@tower-magnate/engine/testing';

const { runs, runsAgree } = timeFullTowerRuns();
const list = (pick: (run: FullTowerRun) => number) =>
  runs.map((run) => pick(run).toFixed(2)).join(', ');
const median = (pick: (run: FullTowerRun) => number) => medianOf(runs.map(pick));
const machine = `${os.cpus().length} x ${os.cpus()[0]?.model.trim()}, ${os.platform()}`;

console.log(
  [
    `Machine: ${machine}, Node ${process.version}`,
    `People: ${runs[0]?.people}`,
    `Average step ms per run: ${list((run) => run.averageMs)} (median ${median((run) => run.averageMs).toFixed(2)})`,
    `p95 step ms per run: ${list((run) => run.p95Ms)} (median ${median((run) => run.p95Ms).toFixed(2)}, budget ${FULL_TOWER_STEP_BUDGET_MS})`,
    `p99 step ms per run: ${list((run) => run.p99Ms)}`,
    `Max step ms per run: ${list((run) => run.maxMs)}`,
    `Step ms when the same hours run in one call: ${list((run) => run.batchedMs)}`,
  ].join('\n'),
);

const inBudget = median((run) => run.p95Ms) <= FULL_TOWER_STEP_BUDGET_MS;
if (!runsAgree) console.error('Runs differ by over 15%, result void.');
if (!inBudget) console.error('Step time is over budget.');
process.exitCode = runsAgree && inBudget ? 0 : 1;
