/**
 * Vertical slice: the 10-floor office tower with stairs over 14 game days, with the forced bomb
 * threat on day 13. Prints the summary of each day and the events, then times every step of
 * three runs. Run with `pnpm bench:vertical-slice`. Exits with 1 when the median average step
 * takes 1.0 ms or more, or the median p99 step 5 ms or more.
 */
import {
  VERTICAL_SLICE_P99_BUDGET_MS,
  VERTICAL_SLICE_STEP_BUDGET_MS,
  formatSliceDays,
  formatSliceEvents,
  medianOf,
  runVerticalSlice,
  timeVerticalSlice,
} from '@tower-magnate/engine/testing';

const RUNS = 3;

const run = runVerticalSlice();
console.log(formatSliceDays(run.days));
console.log(formatSliceEvents(run.events));
console.log(`State hash at step ${run.state.step}: ${run.hash}`);

const timings = Array.from({ length: RUNS }, timeVerticalSlice);
const averageMs = medianOf(timings.map((timing) => timing.averageMs));
const p99Ms = medianOf(timings.map((timing) => timing.p99Ms));
const list = (values: number[]) => values.map((value) => value.toFixed(4)).join(', ');
console.log(`People: ${timings[0]?.people}, steps per run: ${timings[0]?.steps}`);
console.log(
  `Average step ms per run: ${list(timings.map((timing) => timing.averageMs))} (median ${averageMs.toFixed(4)}, budget ${VERTICAL_SLICE_STEP_BUDGET_MS})`,
);
console.log(
  `p99 step ms per run: ${list(timings.map((timing) => timing.p99Ms))} (median ${p99Ms.toFixed(4)}, budget ${VERTICAL_SLICE_P99_BUDGET_MS})`,
);

const inBudget = averageMs < VERTICAL_SLICE_STEP_BUDGET_MS && p99Ms < VERTICAL_SLICE_P99_BUDGET_MS;
if (!inBudget) console.error('Vertical slice is over budget.');
process.exitCode = inBudget ? 0 : 1;
