import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

// Escalators are 8 tiles wide and rise one floor. The canvas covers both levels, so the
// sprite is drawn at its real size, never stretched. The flight is a 1:1 diagonal like the
// stairs, over the central 4 tiles. Two tiles of flat deck on each side are the landings:
// the left one at the floor of the lower level, the right one at the floor of the level above.
export const WALKWAY_WIDTH = 8 * metrics.tileWidth;
export const WALKWAY_HEIGHT = 2 * metrics.floorHeight;
export const ESCALATOR_FRAMES = 4;

export const ESCALATOR_FLOOR_ROW = WALKWAY_HEIGHT - metrics.slabHeight - 1;
const FLOOR_ROW = ESCALATOR_FLOOR_ROW;
export const ESCALATOR_LANDING = 2 * metrics.tileWidth;
export const ESCALATOR_RISE = metrics.floorHeight;
const FIRST_STEP_X = ESCALATOR_LANDING;
const STEP_RUN = 8;
const LAST_RISING_X = ESCALATOR_LANDING + ESCALATOR_RISE - 1;

function newWalkwayCanvas() {
  return new PixelCanvas(WALKWAY_WIDTH, WALKWAY_HEIGHT);
}

// The deck line: flat on the left landing, one pixel up for every pixel to the right over the
// flight, flat again on the right landing one floor higher.
export function escalatorDeckRow(x) {
  const climbed = Math.max(0, Math.min(ESCALATOR_RISE, x - FIRST_STEP_X));
  return FLOOR_ROW - climbed;
}
const slopeRow = escalatorDeckRow;

function stepTreadRow(step) {
  return FLOOR_ROW + 1 - STEP_RISE * (step + 1);
}

// Stairs: a 32x32 box, one level tall and 4 tiles wide, on a canvas with spare
// columns at each side because the steps stick out of the box on the left.
//
// A straight light gray beam climbs one pixel for every pixel along, from the floor
// of the lower level (bottom left) up to the floor of the level above (top right).
// A wooden handrail bar runs above it to the very top, with no posts. Each of the 8 steps is a darker gray horizontal line, 4 pixels wide, one every
// 4 pixels along and 4 up. The first step is on the bottom row. No riser.
export const STAIRS_SIZE = 32;
export const STAIRS_MARGIN = 8;
// Spare rows above the box, for the handrail that rises past the top step.
export const STAIRS_TOP_MARGIN = 8;
const STAIRS_WIDTH = STAIRS_SIZE + 2 * STAIRS_MARGIN;
const STAIRS_HEIGHT = STAIRS_SIZE + STAIRS_TOP_MARGIN;
const STEP_LENGTH = 4;
const STEP_RISE = 4;
const STEP_COUNT = STAIRS_SIZE / STEP_RISE;
// The steps sit 4 pixels left of where the beam would put them.
const STEPS_SHIFT = -4;
const BEAM_THICKNESS = 5;
const BEAM_COLOR = 'silver';
const STEP_COLOR = 'slate';
// The handrail is just the bar, parallel to the beam and this many rows above it.
const RAIL_HEIGHT = 6;

// Column x of the box has its beam top at row 29 - x, and the beam goes 5 rows down.
function drawBeam(stairs) {
  for (let x = 0; x < STAIRS_SIZE; x++) {
    const top = STAIRS_SIZE - 3 - x;
    for (let row = Math.max(0, top); row < Math.min(STAIRS_SIZE, top + BEAM_THICKNESS); row++) {
      stairs.set(STAIRS_MARGIN + x, STAIRS_TOP_MARGIN + row, BEAM_COLOR);
    }
  }
}

function drawSteps(stairs) {
  for (let step = 0; step < STEP_COUNT; step++) {
    const left = STAIRS_MARGIN + step * STEP_LENGTH + STEPS_SHIFT;
    stairs.hline(left, STAIRS_HEIGHT - 1 - step * STEP_RISE, STEP_LENGTH, STEP_COLOR);
  }
}

// The bar runs from above the first step to the end of the beam, past the top of the box.
function drawHandrail(stairs) {
  for (let x = STEPS_SHIFT; x < STAIRS_SIZE; x++) {
    const bar = STAIRS_HEIGHT - 3 - x - RAIL_HEIGHT;
    if (bar >= 0) {
      stairs.set(STAIRS_MARGIN + x, bar, 'wood-light');
      stairs.set(STAIRS_MARGIN + x, bar + 1, 'wood');
    }
  }
}

export function drawStairs() {
  const stairs = new PixelCanvas(STAIRS_WIDTH, STAIRS_HEIGHT);
  drawBeam(stairs);
  drawSteps(stairs);
  drawHandrail(stairs);
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
    if ((x - FIRST_STEP_X - shift + STEP_EVERY) % STEP_EVERY === 0) {
      const deck = slopeRow(x);
      escalator.set(x, deck - 1, 'gray');
      escalator.set(x, deck, 'ink');
    }
  }
}

// Glass panels with a wooden handrail on top, like the stairs, along the landings and the flight.
function drawBalustrade(escalator) {
  for (let x = 2; x < escalator.width - 2; x++) {
    const deck = slopeRow(x);
    const glassTop = deck - GLASS_HEIGHT - 1;
    escalator.vline(x, glassTop, GLASS_HEIGHT, 'glass');
    escalator.set(x, glassTop - 2, 'wood-light');
    escalator.set(x, glassTop - 1, 'wood');
  }
  for (let x = FIRST_STEP_X + 6; x <= LAST_RISING_X; x += 16) {
    const glassTop = slopeRow(x) - GLASS_HEIGHT - 1;
    escalator.set(x, glassTop + 1, 'white');
    escalator.set(x + 1, glassTop, 'white');
  }
  const leftTop = slopeRow(2) - GLASS_HEIGHT - 3;
  escalator.vline(1, leftTop + 1, FLOOR_ROW - leftTop - 1, 'ink');
  escalator.set(1, leftTop + 1, 'charcoal');
  const rightX = escalator.width - 2;
  const rightDeck = slopeRow(rightX);
  const rightTop = rightDeck - GLASS_HEIGHT - 3;
  escalator.vline(rightX, rightTop + 1, GLASS_HEIGHT + 3, 'ink');
  escalator.set(rightX, rightTop + 1, 'charcoal');
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
