import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

// Stairs and escalators are 8 tiles wide and rise from the floor of their lower
// level, on the left, to the slab of the level above, on the right.
export const WALKWAY_WIDTH = 8 * metrics.tileWidth;
export const ESCALATOR_FRAMES = 4;

const FLOOR_ROW = metrics.floorHeight - metrics.slabHeight - 1;
const FIRST_STEP_X = 4;
const STEP_RUN = 8;
const STEP_RISE = 4;
const STEP_COUNT = 7;
const RAIL_HEIGHT = 8;
const LAST_RISING_X = FIRST_STEP_X + STEP_COUNT * STEP_RUN - 1;

function newWalkwayCanvas() {
  return new PixelCanvas(WALKWAY_WIDTH, metrics.floorHeight);
}

// The sloped line under the flight: half a pixel up for every pixel to the right.
function slopeRow(x) {
  const row = FLOOR_ROW - Math.floor((x - FIRST_STEP_X) / 2);
  return Math.max(0, Math.min(FLOOR_ROW, row));
}

function stepTreadRow(step) {
  return FLOOR_ROW + 1 - STEP_RISE * (step + 1);
}

function drawStep(stairs, step) {
  const left = FIRST_STEP_X + step * STEP_RUN;
  const tread = stepTreadRow(step);
  for (let x = left; x < left + STEP_RUN; x++) {
    const underside = Math.min(FLOOR_ROW, slopeRow(x) + 3);
    stairs.vline(x, tread, underside - tread + 1, 'concrete');
    stairs.set(x, tread, 'concrete-light');
    stairs.set(x, underside, 'concrete-dark');
  }
  stairs.vline(left, tread, STEP_RISE, 'concrete-light');
}

function drawStairRail(stairs) {
  for (let step = 0; step < STEP_COUNT; step++) {
    const postX = FIRST_STEP_X + step * STEP_RUN + 3;
    const tread = stepTreadRow(step);
    stairs.vline(postX, tread - RAIL_HEIGHT, RAIL_HEIGHT, 'gray');
  }
  for (let x = FIRST_STEP_X; x <= LAST_RISING_X; x++) {
    const rail = slopeRow(x) - RAIL_HEIGHT - 3;
    stairs.set(x, rail, 'wood-light');
    stairs.set(x, rail + 1, 'wood');
  }
}

// A concrete flight of seven steps; the slab of the level above is the eighth.
export function drawStairs() {
  const stairs = newWalkwayCanvas();
  for (let step = 0; step < STEP_COUNT; step++) {
    drawStep(stairs, step);
  }
  drawStairRail(stairs);
  return stairs;
}

const TRUSS_DEPTH = 6;
const GLASS_HEIGHT = 6;
const STEP_EVERY = 8;

function drawTruss(escalator) {
  for (let x = 0; x < escalator.width; x++) {
    const deck = slopeRow(x);
    const bottom = Math.min(FLOOR_ROW, deck + TRUSS_DEPTH);
    escalator.vline(x, deck, bottom - deck + 1, 'slate');
    escalator.set(x, deck, 'silver');
    escalator.set(x, deck + 1, 'gray');
    if (bottom > deck + 2) {
      escalator.set(x, bottom, 'charcoal');
    }
  }
}

// Step edges move up the slope two pixels per frame, so four frames loop.
function drawMovingSteps(escalator, frame) {
  const shift = frame * (STEP_EVERY / ESCALATOR_FRAMES);
  for (let x = FIRST_STEP_X; x <= LAST_RISING_X; x++) {
    if ((x - FIRST_STEP_X - shift) % STEP_EVERY === 0) {
      const deck = slopeRow(x);
      escalator.set(x, deck - 1, 'gray');
      escalator.set(x, deck, 'ink');
    }
  }
}

function drawBalustrade(escalator) {
  for (let x = 2; x < escalator.width; x++) {
    const deck = slopeRow(x);
    const glassTop = deck - GLASS_HEIGHT - 1;
    escalator.vline(x, glassTop, GLASS_HEIGHT, 'glass');
    escalator.set(x, glassTop - 2, 'charcoal');
    escalator.set(x, glassTop - 1, 'ink');
  }
  for (let x = FIRST_STEP_X + 6; x <= LAST_RISING_X; x += 16) {
    const glassTop = slopeRow(x) - GLASS_HEIGHT - 1;
    escalator.set(x, glassTop + 1, 'white');
    escalator.set(x + 1, glassTop, 'white');
  }
  const newelTop = slopeRow(2) - GLASS_HEIGHT - 3;
  escalator.vline(1, newelTop + 1, FLOOR_ROW - newelTop - 1, 'ink');
  escalator.set(1, newelTop + 1, 'charcoal');
  escalator.hline(0, FLOOR_ROW, 6, 'gray');
}

// One frame of an escalator going up to the right, on a slate truss with a glass balustrade.
export function drawEscalator(frame) {
  const escalator = newWalkwayCanvas();
  drawTruss(escalator);
  drawBalustrade(escalator);
  drawMovingSteps(escalator, frame);
  return escalator;
}
