import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { pixelNoise } from '../noise.mjs';

const { tileWidth, floorHeight } = metrics;
const FLAME_HEIGHT = 16;
const BLAST_SIZE = 32;
const RUBBLE_HEIGHT = 12;

function numbered(id, canvases) {
  return canvases.map((canvas, index) => ({
    id: `${id}_${String(index + 1).padStart(2, '0')}`,
    canvas,
  }));
}

function fromMap(rows, legend) {
  const canvas = new PixelCanvas(rows[0].length, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function disc(canvas, centerX, centerY, radius, color, edgeNoise = 0, seed = 0) {
  for (let y = centerY - radius - 1; y <= centerY + radius + 1; y++) {
    for (let x = centerX - radius - 1; x <= centerX + radius + 1; x++) {
      const distance = Math.hypot(x - centerX, y - centerY);
      const wobble = (pixelNoise(x, y, seed) - 0.5) * edgeNoise;
      if (distance + wobble <= radius) {
        canvas.set(x, y, color);
      }
    }
  }
}

// Fire ---------------------------------------------------------------------

// Flame height in pixels for each of the 8 columns of one tile, per frame.
const flameFrames = [
  [6, 10, 13, 15, 12, 14, 9, 5],
  [8, 12, 15, 11, 14, 12, 7, 6],
  [5, 9, 12, 14, 15, 11, 10, 7],
  [7, 11, 14, 12, 13, 15, 8, 4],
];

// Smaller flames for the column the fire is about to reach.
const frontFrames = [
  [2, 4, 6, 5, 7, 4, 3, 1],
  [3, 5, 5, 7, 5, 6, 2, 2],
  [1, 3, 7, 6, 5, 5, 4, 2],
];

function flameColor(rowsFromTop, rowsFromBottom) {
  if (rowsFromTop === 0) {
    return 'cloth-red';
  }
  if (rowsFromTop === 1) {
    return 'dusk';
  }
  return rowsFromBottom < 3 ? 'lamp-glow' : 'lamp';
}

function flames(heights, canvasHeight) {
  const canvas = new PixelCanvas(tileWidth, canvasHeight);
  heights.forEach((height, x) => {
    const onEdge = x === 0 || x === tileWidth - 1;
    for (let row = 0; row < height; row++) {
      const color = flameColor(height - 1 - row, row);
      canvas.set(x, canvasHeight - 1 - row, onEdge && color === 'lamp' ? 'dusk' : color);
    }
  });
  return canvas;
}

function fireSprites() {
  return [
    ...numbered(
      'effects/fire/flame',
      flameFrames.map((heights) => flames(heights, FLAME_HEIGHT)),
    ),
    ...numbered(
      'effects/fire/front',
      frontFrames.map((heights) => flames(heights, FLAME_HEIGHT / 2)),
    ),
  ];
}

// Smoke --------------------------------------------------------------------

// Each puff rises, grows and fades from charcoal to gray, with holes at the end.
const puffs = [
  { y: 8, radius: 2, color: 'charcoal', lit: 'slate', holes: 0 },
  { y: 6, radius: 3, color: 'slate', lit: 'gray', holes: 0 },
  { y: 4, radius: 3, color: 'slate', lit: 'gray', holes: 0.25 },
  { y: 3, radius: 3, color: 'gray', lit: 'silver', holes: 0.5 },
];

function smokePuff({ y, radius, color, lit, holes }, frame) {
  const canvas = new PixelCanvas(tileWidth, tileWidth + 2);
  disc(canvas, 4, y, radius, color, 1.2, frame);
  disc(canvas, 3, y - 1, radius - 1, lit, 0, frame);
  for (let py = 0; py < canvas.height; py++) {
    for (let px = 0; px < canvas.width; px++) {
      if (pixelNoise(px, py, 90 + frame) < holes) {
        canvas.set(px, py, 'clear');
      }
    }
  }
  return canvas;
}

function smokeSprites() {
  return numbered(
    'effects/smoke/puff',
    puffs.map((puff, frame) => smokePuff(puff, frame)),
  );
}

// Bomb ---------------------------------------------------------------------

const blastStages = [
  { radius: 5, rings: ['dusk', 'lamp', 'lamp-glow'], debris: 0 },
  { radius: 10, rings: ['cloth-red', 'dusk', 'lamp-glow'], debris: 4 },
  { radius: 14, rings: ['cloth-red', 'dusk', 'lamp'], debris: 8 },
  { radius: 15, rings: ['charcoal', 'cloth-red', 'dusk'], debris: 10 },
  { radius: 15, rings: ['slate', 'charcoal', 'slate'], debris: 12 },
];

function blastFrame({ radius, rings, debris }, frame) {
  const canvas = new PixelCanvas(BLAST_SIZE, BLAST_SIZE);
  const center = BLAST_SIZE / 2;
  const [outer, middle, core] = rings;
  disc(canvas, center, center, radius, outer, 5, frame);
  disc(canvas, center, center, Math.round(radius * 0.7), middle, 4, frame + 10);
  disc(canvas, center, center, Math.round(radius * 0.35), core, 2, frame + 20);
  for (let piece = 0; piece < debris; piece++) {
    const angle = pixelNoise(piece, frame, 31) * 2 * Math.PI;
    const distance = Math.min(
      radius + 1 + Math.floor(pixelNoise(piece, frame, 32) * 3),
      center - 1,
    );
    const x = Math.round(center + Math.cos(angle) * distance);
    const y = Math.round(center + Math.sin(angle) * distance);
    canvas.set(x, y, piece % 2 === 0 ? 'ink' : 'concrete');
  }
  return canvas;
}

const RUBBLE_COLORS = ['ink', 'charcoal', 'concrete-dark', 'concrete', 'slate'];

// A pile one tile wide that sits on the floor of a destroyed cell. The two variants
// let the client alternate them along a ruined span.
function rubblePile(seed) {
  const canvas = new PixelCanvas(tileWidth, floorHeight);
  for (let x = 0; x < tileWidth; x++) {
    const height = 4 + Math.floor(pixelNoise(x, 0, seed) * (RUBBLE_HEIGHT - 4));
    for (let row = 0; row < height; row++) {
      const y = floorHeight - 1 - row;
      const pick = Math.floor(pixelNoise(x, y, seed + 1) * RUBBLE_COLORS.length);
      canvas.set(x, y, row === height - 1 ? 'ink' : RUBBLE_COLORS[pick]);
    }
  }
  const barX = 1 + Math.floor(pixelNoise(seed, 1, 3) * (tileWidth - 3));
  canvas.vline(barX, floorHeight - RUBBLE_HEIGHT - 3, 3, 'gray');
  return canvas;
}

function bombSprites() {
  return [
    ...numbered(
      'effects/bomb/blast',
      blastStages.map((stage, frame) => blastFrame(stage, frame)),
    ),
    { id: 'effects/bomb/rubble_a', canvas: rubblePile(5) },
    { id: 'effects/bomb/rubble_b', canvas: rubblePile(17) },
  ];
}

// Cockroaches --------------------------------------------------------------

const roachLegend = { B: 'wood-dark', W: 'wood', L: 'ink' };

const roachFrames = [
  ['B.....B.', '.B...B..', '.WBBBW..', 'LBBBBBBL', 'L.L.L.L.'],
  ['.B...B..', 'B.....B.', '.WBBBW..', 'LBBBBBBL', '.L.L.L.L'],
  ['..B.B...', '.B...B..', '.WBBBW..', '.LBBBBL.', 'L..L.L.L'],
];

function roachSprites() {
  return numbered(
    'effects/roach/crawl',
    roachFrames.map((rows) => fromMap(rows, roachLegend)),
  );
}

// Helicopter ---------------------------------------------------------------

const helicopterLegend = {
  R: 'cloth-red',
  D: 'dusk',
  G: 'glass',
  S: 'silver',
  K: 'slate',
  I: 'ink',
  W: 'white',
};

// Faces right; the client flips it for the other direction.
const helicopterBody = [
  '.........................',
  '.........................',
  '.........................',
  '.................KK......',
  '..........RRRRRRRRK......',
  '.......RRRRRRRRRRRRRRRRK.',
  '.....RRGGGRRRRRRRRRRRRRRK',
  '....RGGGGGGRRRRRRRRRRRRK.',
  '....RGGGGWGRRDDDDRRRRRK..',
  '....RRRRRRRRRRRRRRRRRKK..',
  '.....IIIIIIIIIIIIII......',
  '..SSSSSSSSSSSSSSSSSS.....',
  '..K..................K...',
];

const rotorPoses = [
  { left: 4, width: 19, y: 2 },
  { left: 8, width: 11, y: 2 },
  { left: 2, width: 22, y: 2 },
];

function helicopterFrame({ left, width, y }) {
  const canvas = fromMap(helicopterBody, helicopterLegend);
  canvas.vline(12, y + 1, 2, 'slate');
  canvas.hline(left, y, width, 'silver');
  canvas.hline(left + 1, y + 1, width - 2, 'slate');
  return canvas;
}

const WATER_SIZE = 16;

// The bucket empties in a stream that widens and splashes toward the bottom.
const waterStages = [
  { spread: 1, bottom: 8, splash: false },
  { spread: 3, bottom: 12, splash: false },
  { spread: 5, bottom: 16, splash: true },
];

function waterDrop({ spread, bottom, splash }, frame) {
  const canvas = new PixelCanvas(WATER_SIZE, WATER_SIZE);
  const center = WATER_SIZE / 2;
  for (let y = 0; y < bottom; y++) {
    const half = Math.floor((spread * y) / WATER_SIZE) + 1;
    for (let x = center - half; x < center + half; x++) {
      const shade = pixelNoise(x, y, 40 + frame) < 0.3 ? 'white' : 'sky-light';
      canvas.set(x, y, x === center - half ? 'sky' : shade);
    }
  }
  if (splash) {
    canvas.hline(2, WATER_SIZE - 2, 12, 'sky-light');
    canvas.hline(4, WATER_SIZE - 1, 8, 'sky');
    canvas.set(1, WATER_SIZE - 4, 'white');
    canvas.set(14, WATER_SIZE - 5, 'white');
  }
  return canvas;
}

function helicopterSprites() {
  return [
    ...numbered('effects/helicopter/fly', rotorPoses.map(helicopterFrame)),
    ...numbered('effects/helicopter/water', waterStages.map(waterDrop)),
  ];
}

// Santa Claus --------------------------------------------------------------

const sleighLegend = {
  R: 'cloth-red',
  D: 'dusk',
  W: 'white',
  S: 'skin-light',
  I: 'ink',
  O: 'wood-dark',
  P: 'wood',
  K: 'slate',
};

const sleighBody = [
  '..............WWW.....',
  '.............WRRRW....',
  '............WSSRRR....',
  '............WISRRR....',
  '...RR.......RRRRRRR...',
  '..RRRR.....RRRRRRRRR..',
  '.RRRRRRRRRRRRRRRRRRRR.',
  '.RDDDDDDDDDDDDDDDDDRR.',
  '..RRRRRRRRRRRRRRRRRR..',
  '...OPPPPPPPPPPPPPPO...',
  '.IIIIIIIIIIIIIIIIIIII.',
  'I....................I',
];

const reindeerLegs = [
  ['.O..O.O..O.', '.O...O..O..', 'OO..OO.OO..'],
  ['..O.O..O.O.', '..OO..OO.O.', '.OO...O.OO.'],
  ['O...O.O...O', 'O..O..O..O.', 'OO.OO.OO.OO'],
];

const reindeerBody = [
  'O..O.......',
  '.OOO.......',
  '..OOKO.....',
  '.OOPPPPPPPO',
  'OPPPPPPPPPP',
  '.PPPPPPPPPP',
  '..PPPPPPPP.',
];

const SLEIGH_WIDTH = 22;
const SLEIGH_FRAME = { width: 56, height: 22 };

function reindeer(frame) {
  const canvas = new PixelCanvas(reindeerBody[0].length, reindeerBody.length + 3);
  canvas.drawMap(0, 0, reindeerBody, sleighLegend);
  canvas.drawMap(0, reindeerBody.length, reindeerLegs[frame], sleighLegend);
  canvas.set(0, 3, 'cloth-red');
  return canvas;
}

// Sleigh and reindeer travel left, the way they cross the sky. The lead deer
// and the second deer gallop out of step.
function sleighFrame(frame) {
  const canvas = new PixelCanvas(SLEIGH_FRAME.width, SLEIGH_FRAME.height);
  const bob = frame === 1 ? 1 : 0;
  canvas.stamp(fromMap(sleighBody, sleighLegend), SLEIGH_FRAME.width - SLEIGH_WIDTH, 8 - bob);
  canvas.stamp(reindeer(frame), 12, 6 + bob);
  canvas.stamp(reindeer((frame + 1) % reindeerLegs.length), 0, 9 + bob);
  canvas.hline(11, 14 + bob, 24, 'lamp');
  canvas.set(SLEIGH_FRAME.width - 2, 2 + frame, 'lamp-glow');
  canvas.set(SLEIGH_FRAME.width - 5, 4 - frame, 'white');
  return canvas;
}

function santaSprites() {
  return numbered(
    'effects/santa/sleigh',
    reindeerLegs.map((_, frame) => sleighFrame(frame)),
  );
}

// Treasure chest -----------------------------------------------------------

const chestLegend = {
  P: 'wood',
  O: 'wood-dark',
  L: 'wood-light',
  G: 'lamp',
  I: 'ink',
  K: 'gray',
};

const chestRows = [
  '..IIIIIIIIII..',
  '.IPPPPPPPPPPI.',
  'IPLLLLLLLLLLPI',
  'IPPPPPPPPPPPPI',
  'IKKKKKGGKKKKKI',
  'IOOOOOGGOOOOOI',
  'IPPPPPPPPPPPPI',
  'IOOOOOOOOOOOOI',
  '.IIIIIIIIIIII.',
];

// The sparkle moves across the lid so the chest glints.
const sparkles = [
  [3, 0],
  [7, 1],
  [10, 0],
];

function chestFrame([x, y], frame) {
  const canvas = fromMap(chestRows, chestLegend);
  canvas.set(x, y, 'lamp-glow');
  canvas.set(x - 1, y + 1, 'white');
  canvas.set(x + 1, y + 1, 'white');
  canvas.set(x, y + 2, 'lamp-glow');
  if (frame === 1) {
    canvas.set(12, 6, 'lamp-glow');
  }
  return canvas;
}

function treasureSprites() {
  return numbered('effects/treasure/chest', sparkles.map(chestFrame));
}

// Burnt overlay ------------------------------------------------------------

const SOOT_SEED = 61;

// One floor of loose soot over any sprite: dense under the ceiling, sparse lower down,
// with a little ash along the slab. The client lays it over rooms that are burning or just burned.
function burntOverlay() {
  const canvas = new PixelCanvas(tileWidth, floorHeight);
  const wallRows = floorHeight - metrics.slabHeight;
  for (let y = 0; y < wallRows; y++) {
    const density = 0.55 - 0.45 * (y / wallRows);
    for (let x = 0; x < tileWidth; x++) {
      const noise = pixelNoise(x, y, SOOT_SEED);
      if (noise < density * 0.6) {
        canvas.set(x, y, 'ink');
      } else if (noise < density) {
        canvas.set(x, y, 'charcoal');
      }
    }
  }
  for (let x = 0; x < tileWidth; x++) {
    if (pixelNoise(x, wallRows, SOOT_SEED) < 0.5) {
      canvas.set(x, wallRows - 1, 'slate');
    }
  }
  return canvas;
}

// No-access sticker ----------------------------------------------------------

const STICKER_SIZE = 24;

// A die-cut no-entry sticker: white border, ink outline, red disc with a soft highlight
// at the top left and a shaded rim at the bottom right. The client sticks it on a unit
// that no route reaches.
function noAccessSticker() {
  const canvas = new PixelCanvas(STICKER_SIZE, STICKER_SIZE);
  const center = (STICKER_SIZE - 1) / 2;
  for (let y = 0; y < STICKER_SIZE; y++) {
    for (let x = 0; x < STICKER_SIZE; x++) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);
      if (distance > 11.8) {
        continue;
      }
      if (distance > 10.8) {
        canvas.set(x, y, dx + dy > 6 ? 'silver' : 'white');
      } else if (distance > 9.7) {
        canvas.set(x, y, 'ink');
      } else if (distance > 8.4 && dx + dy > 3) {
        canvas.set(x, y, 'wood-dark');
      } else if (distance > 7.2 && dx + dy < -6) {
        canvas.set(x, y, 'dusk');
      } else {
        canvas.set(x, y, 'cloth-red');
      }
    }
  }
  // The bar: ink outline, white face, light shade underneath.
  canvas.fillRect(4, 8, 16, 8, 'ink');
  canvas.fillRect(5, 9, 14, 5, 'white');
  canvas.fillRect(5, 14, 14, 1, 'cloud');
  canvas.fillRect(4, 8, 1, 1, 'cloth-red');
  canvas.fillRect(19, 8, 1, 1, 'cloth-red');
  canvas.fillRect(4, 15, 1, 1, 'cloth-red');
  canvas.fillRect(19, 15, 1, 1, 'cloth-red');
  // A glint on the border.
  canvas.set(6, 4, 'white');
  canvas.set(5, 5, 'white');
  return canvas;
}

// Availability tape ------------------------------------------------------------

const TAPE_WIDTH = 96;
const TAPE_HEIGHT = 56;
const TAPE_LENGTH = 88;
const TAPE_THICKNESS = 26;
const TAPE_ANGLE = (-18 * Math.PI) / 180;
const GLYPH_SCALE = 2;

// 5 x 7 capital letters, enough for SE RENTA and SE VENDE.
const GLYPHS = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
};

// Lays the text out as rows of on/off pixels at GLYPH_SCALE canvas pixels per font pixel.
function textBitmap(text) {
  const width = text.length * 6 * GLYPH_SCALE - GLYPH_SCALE;
  const rows = Array.from({ length: 7 * GLYPH_SCALE }, () => Array(width).fill(false));
  [...text].forEach((letter, index) => {
    const glyph = GLYPHS[letter];
    if (!glyph) {
      return;
    }
    glyph.forEach((line, gy) => {
      [...line].forEach((cell, gx) => {
        if (cell !== '#') {
          return;
        }
        for (let dy = 0; dy < GLYPH_SCALE; dy++) {
          for (let dx = 0; dx < GLYPH_SCALE; dx++) {
            rows[gy * GLYPH_SCALE + dy][(index * 6 + gx) * GLYPH_SCALE + dx] = true;
          }
        }
      });
    });
  });
  return rows;
}

// A strip of red adhesive tape stuck on at a slant, with torn ends, a glossy top edge,
// a shaded lower edge and white lettering. It is drawn at twice the pixel density of
// the units and shown at half size, so the lettering stays readable.
function availabilityTape(text) {
  const canvas = new PixelCanvas(TAPE_WIDTH, TAPE_HEIGHT);
  const bitmap = textBitmap(text);
  const textWidth = bitmap[0].length;
  const textHeight = bitmap.length;
  const cos = Math.cos(TAPE_ANGLE);
  const sin = Math.sin(TAPE_ANGLE);
  const cx = (TAPE_WIDTH - 1) / 2;
  const cy = (TAPE_HEIGHT - 1) / 2;
  for (let y = 0; y < TAPE_HEIGHT; y++) {
    for (let x = 0; x < TAPE_WIDTH; x++) {
      // Position along the tape (u) and across it (v).
      const u = (x - cx) * cos + (y - cy) * sin;
      const v = -(x - cx) * sin + (y - cy) * cos;
      const tear = Math.floor(Math.abs(v) / 2) % 2 === 0 ? 0 : 2;
      if (Math.abs(u) > TAPE_LENGTH / 2 - tear || Math.abs(v) > TAPE_THICKNESS / 2) {
        continue;
      }
      const edge = TAPE_THICKNESS / 2 - Math.abs(v);
      let color = 'cloth-red';
      if (edge < 1.5) {
        color = 'ink';
      } else if (edge < 3 && v < 0) {
        color = 'dusk';
      } else if (edge < 3.5 && v > 0) {
        color = 'wood-dark';
      }
      const tx = Math.round(u + textWidth / 2);
      const ty = Math.round(v + textHeight / 2);
      if (edge >= 3.5 && bitmap[ty]?.[tx]) {
        color = 'white';
      }
      canvas.set(x, y, color);
    }
  }
  return canvas;
}

export const effectsGroup = {
  name: 'effects',
  draw() {
    return [
      ...fireSprites(),
      ...smokeSprites(),
      ...bombSprites(),
      ...roachSprites(),
      ...helicopterSprites(),
      ...santaSprites(),
      ...treasureSprites(),
      { id: 'effects/burnt/overlay', canvas: burntOverlay() },
      { id: 'effects/no-access/sticker', canvas: noAccessSticker() },
      { id: 'effects/for-rent/sticker', canvas: availabilityTape('SE RENTA') },
      { id: 'effects/for-sale/sticker', canvas: availabilityTape('SE VENDE') },
    ];
  },
};
