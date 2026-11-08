/**
 * TM-107 events benchmark: bomb search from 10:00 to 13:00 and an hour of fire on three levels,
 * on a 40-floor tower with 252 people and 5 security offices. Run with `pnpm bench:events`.
 * Exits with 1 when any of the 3 runs spends over 0.2 ms per step on average in the events phase.
 * The slowest run decides, so noise between runs cannot pass an over-budget result.
 */
import {
  MAX_EVENT_STEP_MS,
  medianEventCosts,
  timeSecurityRuns,
} from '@tower-magnate/engine/testing';

const SECURITY_OFFICES = 5;

const runs = timeSecurityRuns(SECURITY_OFFICES);
const { bombMs, fireMs } = medianEventCosts(runs);
const list = (values: number[]) => values.map((value) => value.toFixed(4)).join(', ');
const bombCosts = runs.map((run) => run.bombAverageMs);
const fireCosts = runs.map((run) => run.fireAverageMs);

console.log(`People ${runs[0]?.people}, security offices ${SECURITY_OFFICES}`);
for (const run of runs) {
  const found =
    run.bombFoundStep === null ? 'not found by 13:00' : `found at step ${run.bombFoundStep}`;
  console.log(`Bomb search: ${run.levelsSearched} levels searched, bomb ${found}`);
}
console.log(`Bomb search ms per step: ${list(bombCosts)} (median ${bombMs.toFixed(4)})`);
console.log(`Fire ms per step: ${list(fireCosts)} (median ${fireMs.toFixed(4)})`);
console.log(`Budget ${MAX_EVENT_STEP_MS} ms per step for every run`);

const slowest = Math.max(...bombCosts, ...fireCosts);
if (slowest > MAX_EVENT_STEP_MS) console.error('Events phase is over budget.');
process.exitCode = slowest <= MAX_EVENT_STEP_MS ? 0 : 1;
