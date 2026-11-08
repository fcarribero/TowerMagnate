import { metrics } from './metrics.mjs';
import { pixelNoise } from './noise.mjs';

const SLAB_STEP_DOWN = {
  'concrete-light': 'concrete-dark',
  concrete: 'concrete-dark',
  'concrete-dark': 'charcoal',
};
const SOOT_SEED = 7;
const EMBER_CHANCE = 0.03;
const RUBBLE_ROWS = 3;

function isInkFrame(canvas, x, y) {
  return x === 0 || x === canvas.width - 1 || y === 0;
}

function isSlabRow(canvas, y) {
  return y % metrics.floorHeight >= metrics.floorHeight - metrics.slabHeight;
}

function breakWindow(canvas, { left, top, width, height }) {
  canvas.fillRect(left - 1, top - 1, width + 2, height + 2, 'charcoal');
  canvas.fillRect(left, top, width, height, 'ink');
  canvas.set(left - 1, top - 1, 'ink');
  canvas.set(left + width, top + height, 'ink');
  for (let x = left; x < left + width; x += 3) {
    canvas.set(x, top, 'slate');
    canvas.set(x + 1, top + 1, 'slate');
  }
}

function scatterRubble(canvas, y) {
  for (let x = 1; x < canvas.width - 1; x++) {
    const noise = pixelNoise(x, y, SOOT_SEED);
    if (noise < 0.3) {
      canvas.set(x, y, 'ink');
    } else if (noise < 0.45) {
      canvas.set(x, y, 'slate');
    }
  }
}

// Generic burnt look for any unit sprite: the ink frame and slabs stay, every
// other pixel becomes charcoal with soot, floors are covered in rubble and a few
// embers glow. Furniture is gone, so the drawn props are not kept.
export function toBurnt(daySprite, { windows = [] } = {}) {
  const burnt = daySprite.clone();
  for (let y = 0; y < burnt.height; y++) {
    for (let x = 0; x < burnt.width; x++) {
      if (burnt.get(x, y) === 0 || isInkFrame(burnt, x, y)) {
        continue;
      }
      if (isSlabRow(burnt, y)) {
        burnt.set(x, y, SLAB_STEP_DOWN[daySprite.get(x, y)] ?? 'charcoal');
        continue;
      }
      const soot = pixelNoise(x, y, SOOT_SEED);
      burnt.set(x, y, soot < 0.12 ? 'ink' : 'charcoal');
    }
  }

  const floors = burnt.height / metrics.floorHeight;
  for (let level = 0; level < floors; level++) {
    const floorRow = (level + 1) * metrics.floorHeight - metrics.slabHeight - 1;
    for (let row = 0; row < RUBBLE_ROWS; row++) {
      scatterRubble(burnt, floorRow - row);
    }
    for (let x = 1; x < burnt.width - 1; x++) {
      if (pixelNoise(x, floorRow, SOOT_SEED + 1) < EMBER_CHANCE) {
        burnt.set(x, floorRow - 1, 'dusk');
        burnt.set(x, floorRow, 'lamp');
      }
    }
  }
  windows.forEach((window) => breakWindow(burnt, window));
  return burnt;
}
