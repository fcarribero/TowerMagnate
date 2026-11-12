import { colorIndex } from '../palette.mjs';

const OBRA_COLOR_BY_TOWER_COLOR = {
  ink: 'obra-ink',
  charcoal: 'obra-ink',
  slate: 'obra-muted',
  gray: 'obra-muted',
  silver: 'obra-paper-shade',
  cloud: 'obra-paper',
  white: 'obra-paper',
  'concrete-dark': 'obra-muted',
  concrete: 'obra-paper-shade',
  'concrete-light': 'obra-paper',
  'wood-dark': 'obra-ink',
  wood: 'obra-paper-shade',
  'wood-light': 'obra-yellow',
  'sky-deep': 'obra-blue',
  sky: 'obra-blue',
  'sky-light': 'obra-paper',
  glass: 'obra-blue',
  dusk: 'obra-yellow',
  lamp: 'obra-yellow',
  'lamp-glow': 'obra-paper',
  'leaf-dark': 'obra-ink',
  leaf: 'obra-green',
  'skin-dark': 'obra-muted',
  'skin-mid': 'obra-yellow',
  'skin-light': 'obra-paper',
  'cloth-red': 'obra-red',
  'cloth-blue': 'obra-blue',
};

const INK = colorIndex('obra-ink');
const CLEAR = 0;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function isOutline(canvas, x, y) {
  if (canvas.get(x, y) !== INK) {
    return false;
  }
  return NEIGHBORS.some(([dx, dy]) => canvas.get(x + dx, y + dy) === CLEAR);
}

function isFill(canvas, x, y) {
  const index = canvas.get(x, y);
  return index !== CLEAR && index !== INK;
}

// A fill pixel next to the outline turns ink when fill is left on its far side,
// so the outline becomes 2 px thick and the middle of the shape stays.
function shouldThicken(canvas, x, y) {
  if (!isFill(canvas, x, y)) {
    return false;
  }
  return NEIGHBORS.some(
    ([dx, dy]) => isOutline(canvas, x - dx, y - dy) && isFill(canvas, x + 2 * dx, y + 2 * dy),
  );
}

function thickenOutline(canvas) {
  const thick = canvas.clone();
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (shouldThicken(canvas, x, y)) {
        thick.set(x, y, INK);
      }
    }
  }
  return thick;
}

// Redraws a tower-palette icon with the obra colors and a thick ink outline.
export function toObra(canvas) {
  return thickenOutline(canvas.recolor(OBRA_COLOR_BY_TOWER_COLOR));
}
