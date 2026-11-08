/**
 * Vertical slice part A: the 10-floor office tower with stairs over one game week.
 * Prints the summary of each day, then the average step time of the fastest of three runs.
 * Run with `pnpm bench:vertical-slice`. Exits with 1 when the average step takes 1.0 ms or more.
 */
import {
  VERTICAL_SLICE_STEP_BUDGET_MS,
  fastestRunMillis,
  formatSliceDays,
  runVerticalSlice,
  verticalSliceTower,
} from '@tower-magnate/engine/testing';

const STEPS = 7 * 8_640;

const run = runVerticalSlice();
console.log(formatSliceDays(run.days));
console.log(`State hash at step ${run.state.step}: ${run.hash}`);

const tower = verticalSliceTower();
const elapsed = fastestRunMillis(() => runVerticalSlice(tower));
const averageStepMs = elapsed / STEPS;
console.log(`People: ${run.state.people.id.length}, steps: ${STEPS}`);
console.log(
  `Average step: ${averageStepMs.toFixed(4)} ms (fastest of 3), budget ${VERTICAL_SLICE_STEP_BUDGET_MS} ms`,
);

const inBudget = averageStepMs < VERTICAL_SLICE_STEP_BUDGET_MS;
if (!inBudget) console.error('Vertical slice week is over budget.');
process.exitCode = inBudget ? 0 : 1;
