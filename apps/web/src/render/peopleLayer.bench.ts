/**
 * TM-221 people layer benchmark: one frame update of 2,000 people on a 100-floor tower.
 * Run with `pnpm bench:people-layer`. The result is the median of 3 runs of 20 frames each,
 * void if they differ by over 15%.
 */
import { crowdFrame, layerWithArt } from '../testing/peopleLayerFixtures';

const PEOPLE = 2000;
const FRAME_BUDGET_MS = 8;
const FRAMES_PER_RUN = 20;
const RUN_AGREEMENT = 0.15;
const MAX_ATTEMPTS = 10;

function timeUntilRunsAgree(action: () => void): number | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const durations = [0, 0, 0].map(() => {
      const start = performance.now();
      action();
      return performance.now() - start;
    });
    const [fastest = 0, median = 0, slowest = 0] = durations.sort((a, b) => a - b);
    if (slowest - fastest <= fastest * RUN_AGREEMENT) return median;
  }
  return null;
}

const { layer } = layerWithArt();
layer.showOnly({ lowest: 0, highest: 99 });
layer.show(crowdFrame(PEOPLE, 0));

let shift = 0;
const medianMs = timeUntilRunsAgree(() => {
  for (let frame = 0; frame < FRAMES_PER_RUN; frame++) {
    shift += 0.25;
    layer.show(crowdFrame(PEOPLE, shift));
  }
});
if (medianMs === null) {
  console.error('Runs never agreed within 15%, result void.');
  process.exitCode = 1;
} else {
  const frameMs = medianMs / FRAMES_PER_RUN;
  console.log(
    `People layer, ${PEOPLE} people: median ${frameMs.toFixed(2)} ms per frame (budget ${FRAME_BUDGET_MS} ms)`,
  );
  process.exitCode = frameMs < FRAME_BUDGET_MS ? 0 : 1;
}
