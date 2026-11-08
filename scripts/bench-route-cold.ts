/** TM-207: 3000 trips to distinct destinations right after a structure change. Informational until the 200 us target is met. */
import { TransportGraph, TripPlanner } from '@tower-magnate/engine';
import { hundredFloorTower } from '@tower-magnate/engine/testing';

const state = hundredFloorTower();
const graph = new TransportGraph(state);
graph.rebuild(state);
let v = 11;
const rnd = () => (v = (v * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pt = () => ({ level: 1 + Math.floor(rnd() * 100), x: Math.floor(rnd() * 375) });
const trips = Array.from({ length: 3000 }, () => ({ from: pt(), to: pt() }));
const planner = new TripPlanner(graph);
const t = performance.now();
for (const trip of trips) planner.plan(state, { ...trip, userClass: 'other' });
console.log(
  `Cold planning, 3000 distinct destinations: ${(((performance.now() - t) * 1000) / 3000).toFixed(1)} us/trip`,
);
