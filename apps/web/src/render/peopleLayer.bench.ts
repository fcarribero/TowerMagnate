/**
 * People layer benchmark: one frame update of 3,000 people on a 100-floor tower,
 * with 1% of them leaving and as many arriving on every frame.
 * Run with `pnpm bench:people-layer`. Each case is the median of 5 runs of 60 frames after a warm-up,
 * void if the middle three differ by over 15%.
 */
import type { LevelRange } from './camera';
import { layerWithArt, towerCrowdFrame } from '../testing/peopleLayerFixtures';

const PEOPLE = 3000;
const FLOORS = 100;
const FRAME_BUDGET_MS = 8;
const FRAMES_PER_RUN = 60;
const WARM_UP_FRAMES = 120;
const LEAVING_EVERY = 100;
const RUN_AGREEMENT = 0.15;
const MAX_ATTEMPTS = 10;

interface BenchCase {
  name: string;
  range: LevelRange;
}

/** 34 floors fit a 1080-pixel canvas at zoom 1; the whole tower is the worst case. */
const CASES: BenchCase[] = [
  { name: 'zoom 1 view, 34 floors', range: { lowest: 10, highest: 43 } },
  { name: 'all 100 floors in view', range: { lowest: 0, highest: FLOORS - 1 } },
];

/** Times 5 runs and drops the fastest and slowest; the middle three must agree. */
function timeUntilRunsAgree(action: () => void): number | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const durations = [0, 0, 0, 0, 0].map(() => {
      const start = performance.now();
      action();
      return performance.now() - start;
    });
    const [, fastest = 0, median = 0, slowest = 0] = durations.sort((a, b) => a - b);
    if (slowest - fastest <= fastest * RUN_AGREEMENT) return median;
  }
  return null;
}

function frameMsOf(range: LevelRange): number | null {
  const { layer } = layerWithArt();
  layer.showOnly(range);
  let frame = 0;
  const nextFrame = () => {
    frame += 1;
    return towerCrowdFrame(
      PEOPLE,
      frame * 0.25,
      FLOORS,
      (index) => (index + frame) % LEAVING_EVERY === 0,
    );
  };
  layer.show(nextFrame());
  const frames = Array.from({ length: FRAMES_PER_RUN }, nextFrame);
  let next = 0;
  for (let count = 0; count < WARM_UP_FRAMES; count++) {
    layer.show(frames[next++ % frames.length]!);
  }
  const medianMs = timeUntilRunsAgree(() => {
    for (let count = 0; count < FRAMES_PER_RUN; count++) {
      layer.show(frames[next++ % frames.length]!);
    }
  });
  return medianMs === null ? null : medianMs / FRAMES_PER_RUN;
}

let failed = false;
for (const { name, range } of CASES) {
  const frameMs = frameMsOf(range);
  if (frameMs === null) {
    console.error(`People layer, ${name}: runs never agreed within 15%, result void.`);
    failed = true;
    continue;
  }
  console.log(
    `People layer, ${PEOPLE} people, ${name}: median ${frameMs.toFixed(2)} ms per frame (budget ${FRAME_BUDGET_MS} ms)`,
  );
  if (frameMs >= FRAME_BUDGET_MS) failed = true;
}
process.exitCode = failed ? 1 : 0;
