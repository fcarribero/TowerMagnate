/**
 * Trek system alone: 3,000 people walking along a lobby for 200 steps, three runs.
 * Run with `pnpm bench:trek`. Exits with 1 when the median average step is over 1.0 ms
 * or the median p99 is over 5 ms.
 */
import {
  MAX_TREK_AVERAGE_MS,
  MAX_TREK_P99_MS,
  TREK_CROWD_PEOPLE,
  medianTrekCrowdTiming,
  timeTrekCrowd,
} from '@tower-magnate/engine/testing';

const runs = [timeTrekCrowd(), timeTrekCrowd(), timeTrekCrowd()];
const { averageMs, p99Ms } = medianTrekCrowdTiming(runs);

for (const run of runs) {
  console.log(`Run: average ${run.averageMs.toFixed(3)} ms, p99 ${run.p99Ms.toFixed(3)} ms`);
}
console.log(
  `${TREK_CROWD_PEOPLE} walkers, median: average ${averageMs.toFixed(3)} ms, p99 ${p99Ms.toFixed(3)} ms`,
);
console.log(`Budget: average ${MAX_TREK_AVERAGE_MS} ms, p99 ${MAX_TREK_P99_MS} ms`);

const inBudget = averageMs < MAX_TREK_AVERAGE_MS && p99Ms < MAX_TREK_P99_MS;
if (!inBudget) console.error('Trek step is over budget.');
process.exitCode = inBudget ? 0 : 1;
