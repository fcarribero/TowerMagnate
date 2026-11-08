/**
 * TM-98 graph benchmark: full rebuild of a 100-floor tower with 12 shafts.
 * Run with `pnpm bench:graph`. The result is the median of 3 runs of 20 rebuilds each, void if they differ by over 15%.
 */
import { TransportGraph } from '@tower-magnate/engine';
import { hundredFloorTower } from '@tower-magnate/engine/testing';
import { timeUntilRunsAgree } from './run-timing';

const REBUILD_BUDGET_MS = 50;
const REBUILDS_PER_RUN = 20;

const state = hundredFloorTower();
const graph = new TransportGraph(state);
graph.rebuild(state);

const medianMs = timeUntilRunsAgree(() => {
  for (let rebuild = 0; rebuild < REBUILDS_PER_RUN; rebuild++) graph.rebuild(state);
});
if (medianMs === null) {
  console.error('Runs never agreed within 15%, result void.');
  process.exitCode = 1;
} else {
  const rebuildMs = medianMs / REBUILDS_PER_RUN;
  console.log(`Graph rebuild: median ${rebuildMs.toFixed(1)} ms (budget ${REBUILD_BUDGET_MS} ms)`);
  process.exitCode = rebuildMs < REBUILD_BUDGET_MS ? 0 : 1;
}
