import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { pixelNoise } from '../noise.mjs';

const BELL_FRAME = { width: 32, height: 26 };
const BELL_PIVOT = { x: 16, y: 1 };
const BELL_SWING_DEGREES = [-26, -6, 26, 6];

// Half width of the bell body for each row, from the crown down to the lip.
const BELL_HALF_WIDTHS = [2, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7];
const BELL_TOP_ROW = 4;
const BELL_CENTER = 16;

function bellAtRest() {
  const canvas = new PixelCanvas(BELL_FRAME.width, BELL_FRAME.height);
  canvas.fillRect(BELL_CENTER - 4, 0, 9, 2, 'wood-dark');
  canvas.vline(BELL_CENTER, 2, 2, 'wood-dark');
  BELL_HALF_WIDTHS.forEach((half, row) => {
    const y = BELL_TOP_ROW + row;
    canvas.hline(BELL_CENTER - half, y, half * 2 + 1, 'lamp');
    canvas.set(BELL_CENTER - half + 1, y, 'lamp-glow');
    canvas.set(BELL_CENTER + half - 1, y, 'wood-light');
    canvas.set(BELL_CENTER + half, y, 'wood-light');
  });
  const lipY = BELL_TOP_ROW + BELL_HALF_WIDTHS.length;
  canvas.hline(BELL_CENTER - 8, lipY, 17, 'wood-light');
  canvas.hline(BELL_CENTER - 8, lipY + 1, 17, 'wood');
  canvas.fillRect(BELL_CENTER - 1, lipY + 2, 3, 2, 'wood-dark');
  return canvas;
}

// Turns the drawing around the pivot, sampling the nearest source pixel.
function swung(source, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turned = new PixelCanvas(source.width, source.height);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const dx = x - BELL_PIVOT.x;
      const dy = y - BELL_PIVOT.y;
      const fromX = Math.round(BELL_PIVOT.x + dx * cos + dy * sin);
      const fromY = Math.round(BELL_PIVOT.y - dx * sin + dy * cos);
      turned.set(x, y, source.get(fromX, fromY));
    }
  }
  return turned;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function outlined(canvas) {
  const result = canvas.clone();
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const touchesBell = NEIGHBOURS.some(([dx, dy]) => canvas.get(x + dx, y + dy) !== 0);
      if (canvas.get(x, y) === 0 && touchesBell) {
        result.set(x, y, 'ink');
      }
    }
  }
  return result;
}

function numbered(id, canvases) {
  return canvases.map((canvas, index) => ({
    id: `${id}_${String(index + 1).padStart(2, '0')}`,
    canvas,
  }));
}

function bellSprites() {
  const rest = bellAtRest();
  const frames = BELL_SWING_DEGREES.map((degrees) => outlined(swung(rest, degrees)));
  return numbered('events/wedding-bell/swing', frames);
}

const PETAL_FRAME_SIZE = metrics.floorHeight;
const PETAL_ORIGIN = { x: PETAL_FRAME_SIZE / 2, y: PETAL_FRAME_SIZE - metrics.slabHeight - 4 };
const PETAL_COUNT = 16;
const PETAL_SEED = 182;
const PETAL_COLORS = ['white', 'cloud', 'lamp-glow', 'cloth-red', 'white', 'cloud'];

// How far the petals have flown, how far gravity has pulled them down and
// how big each one is, for each frame.
const PETAL_FRAMES = [
  { reach: 3, fall: 0, size: 2 },
  { reach: 9, fall: 1, size: 2 },
  { reach: 14, fall: 4, size: 2 },
  { reach: 17, fall: 9, size: 1 },
];

function petalBurst({ reach, fall, size }) {
  const canvas = new PixelCanvas(PETAL_FRAME_SIZE, PETAL_FRAME_SIZE);
  for (let petal = 0; petal < PETAL_COUNT; petal++) {
    const spread = (petal + pixelNoise(petal, 0, PETAL_SEED)) / PETAL_COUNT;
    const angle = Math.PI * (1.08 + 0.84 * spread);
    const speed = 0.6 + 0.4 * pixelNoise(petal, 1, PETAL_SEED);
    const x = Math.round(PETAL_ORIGIN.x + Math.cos(angle) * reach * speed);
    const y = Math.round(PETAL_ORIGIN.y + Math.sin(angle) * reach * speed + fall * speed);
    const height = size === 2 && petal % 2 === 0 ? 1 : size;
    canvas.fillRect(x, y, size, height, PETAL_COLORS[petal % PETAL_COLORS.length]);
  }
  return canvas;
}

function petalSprites() {
  return numbered('events/wedding-petals/burst', PETAL_FRAMES.map(petalBurst));
}

export const eventsGroup = {
  name: 'events',
  draw() {
    return [...bellSprites(), ...petalSprites()];
  },
};
