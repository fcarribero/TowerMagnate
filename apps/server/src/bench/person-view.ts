/**
 * TM-210 person view bench: what the view builder adds to one step at 250 and 3,000 people.
 * Run with `pnpm bench:person-view`. The cost is building the people views of a snapshot
 * for a viewport that holds everyone. A run is the median of SAMPLES_PER_RUN timings of
 * CALLS_PER_SAMPLE calls; the result is the median of 3 runs. Runs that differ by over 15% void the result,
 * unless every run is under budget, which settles the verdict anyway.
 */
import { performance } from 'node:perf_hooks';
import { addPeopleForUnit, createTower, listPeople, newUnit } from '@tower-magnate/engine';
import type { TowerState, Viewport } from '@tower-magnate/shared';
import { peopleViews } from '../tower-socket/snapshot';

const CALLS_PER_SAMPLE = 2_000;
const SAMPLES_PER_RUN = 9;
const RUNS = 3;
const RUN_TOLERANCE = 0.15;
const CASES = [
  { people: 250, budgetMs: 0.2 },
  { people: 3_000, budgetMs: 1 },
];
const WIDE_VIEW: Viewport = { levelFrom: 1, levelTo: 100, xFrom: 0, xTo: 374 };

/** Offices of 6 workers each, filled in up to the requested number of people. */
function towerWithPeople(people: number): TowerState {
  const state = createTower(20270106);
  for (let index = 1; index <= Math.ceil(people / 6); index++) {
    const id = `u${index}`;
    state.units[id] = newUnit(id, 'office', 0, 2);
    addPeopleForUnit(state, id);
  }
  return state;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function spread(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) / Math.min(...values);
}

function msPerCall(state: TowerState): number {
  const people = listPeople(state.people);
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES_PER_RUN; sample++) {
    const started = performance.now();
    for (let call = 0; call < CALLS_PER_SAMPLE; call++) {
      peopleViews(state, people, WIDE_VIEW);
    }
    samples.push((performance.now() - started) / CALLS_PER_SAMPLE);
  }
  return median(samples);
}

console.log(
  `node ${process.version}, ${RUNS} runs of ${SAMPLES_PER_RUN}x${CALLS_PER_SAMPLE} calls`,
);
let passed = true;
for (const { people, budgetMs } of CASES) {
  const state = towerWithPeople(people);
  const sent = peopleViews(state, listPeople(state.people), WIDE_VIEW).length;
  msPerCall(state);
  const runs = Array.from({ length: RUNS }, () => msPerCall(state));
  const added = median(runs);
  const agree = spread(runs) <= RUN_TOLERANCE;
  const settled = agree || runs.every((run) => run <= budgetMs);
  console.log(`${people} people (${sent} in view)`);
  console.log(`  runs (ms added per step): ${runs.map((run) => run.toFixed(4)).join(', ')}`);
  console.log(`  median ${added.toFixed(4)} ms (budget ${budgetMs} ms)`);
  console.log(
    `  runs agree within 15%: ${agree ? 'yes' : settled ? 'no, but all runs are under budget' : 'no, result void, rerun'}`,
  );
  passed = passed && settled && added <= budgetMs;
}
console.log(passed ? 'PASS' : 'FAIL');
process.exitCode = passed ? 0 : 1;
