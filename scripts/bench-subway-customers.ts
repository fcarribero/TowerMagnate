/**
 * The venue tower's weekday of outside customers with a subway station, against the same
 * customer plan without one. Run with `pnpm bench:subway`. Exits with 1 when the subway
 * entrance adds 0.05 ms or more per step.
 */
import { MAX_SUBWAY_STEP_MS, subwayStepMillis } from '@tower-magnate/engine/testing';

const { withSubway, without, added, peakPeople } = subwayStepMillis();

console.log(`Peak people in the tower: ${peakPeople}`);
console.log(`With the subway: ${withSubway.toFixed(4)} ms per step`);
console.log(`Without: ${without.toFixed(4)} ms per step`);
console.log(
  `Added by the subway entrance: ${added.toFixed(4)} ms per step (budget ${MAX_SUBWAY_STEP_MS} ms)`,
);

const inBudget = added < MAX_SUBWAY_STEP_MS;
if (!inBudget) console.error('The subway entrance is over budget.');
process.exitCode = inBudget ? 0 : 1;
