/**
 * TM-99 route planner benchmark: 3000 trips on the 100-floor tower, planned from a cold cache.
 * Run with `pnpm bench:routes`. The result is the median of 3 runs, void if they differ by over 15%.
 */
import { TransportGraph, TripPlanner } from '@tower-magnate/engine';
import { hundredFloorTower } from '@tower-magnate/engine/testing';
import { timeUntilRunsAgree } from './run-timing';

const TRIPS = 3000;
const BUDGET_MICROSECONDS = 20;
const TOWER_WIDTH = 375;
const TOP_LEVEL = 100;

const state = hundredFloorTower();
const graph = new TransportGraph(state);
graph.rebuild(state);

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const random = seededRandom(7);
const point = () => ({
  level: 1 + Math.floor(random() * TOP_LEVEL),
  x: Math.floor(random() * TOWER_WIDTH),
});
const trips = Array.from({ length: TRIPS }, () => ({ from: point(), to: point() }));

const medianMs = timeUntilRunsAgree(() => {
  const planner = new TripPlanner(graph);
  for (const trip of trips) planner.plan(state, { ...trip, userClass: 'other' });
});
if (medianMs === null) {
  console.error('Runs never agreed within 15%, result void.');
  process.exitCode = 1;
} else {
  const microseconds = (medianMs * 1000) / TRIPS;
  console.log(
    `Route planning: median ${microseconds.toFixed(1)} us per trip (budget ${BUDGET_MICROSECONDS} us)`,
  );
  process.exitCode = microseconds < BUDGET_MICROSECONDS ? 0 : 1;
}
