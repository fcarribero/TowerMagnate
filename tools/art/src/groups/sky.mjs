import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { pixelNoise } from '../noise.mjs';

const BAND_WIDTH = 64;
const DITHER_ROWS = 4;
const SCATTER_CELL = 8;
const BACKDROP_WIDTH = 128;
const SKYLINE_HEIGHT = 48;
const HILLS_HEIGHT = 16;

// The top band fades into the color below it through ordered dithering that
// gets denser each row and ends on a solid row, so it meets the middle band
// without a hard edge. The middle band covers many floors in a row, so it mixes its two colors evenly
// instead and repeats without a seam in both directions.
// Dusk is shared by sunrise and sunset.
const bands = {
  day: {
    top: ['sky-deep', 'sky'],
    middle: ['sky', 'sky-light'],
    horizon: ['sky-light', 'sky-light'],
  },
  dusk: {
    top: ['night', 'sky-deep'],
    middle: ['sky-deep', 'dusk'],
    horizon: ['dusk', 'dusk'],
  },
  night: {
    top: ['night-deep', 'night'],
    middle: ['night', 'night'],
    horizon: ['night', 'night'],
  },
};

const FADE_THRESHOLDS = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const starredBands = new Set(['night/top', 'night/middle']);

function skyBand(color, nextColor) {
  const height = metrics.floorHeight;
  const tile = new PixelCanvas(BAND_WIDTH, height);
  tile.fillRect(0, 0, BAND_WIDTH, height, color);
  for (let row = 0; row < DITHER_ROWS; row++) {
    const y = height - DITHER_ROWS + row;
    const coverage = ((row + 1) * 16) / DITHER_ROWS;
    for (let x = 0; x < BAND_WIDTH; x++) {
      if (FADE_THRESHOLDS[y % 4][x % 4] < coverage) {
        tile.set(x, y, nextColor);
      }
    }
  }
  return tile;
}

// One 2 x 2 fleck per 8 x 8 cell, shifted half a cell on every other row of
// cells, so the pattern stays even and wraps cleanly on all four edges.
function scatterBand(color, fleckColor) {
  const height = metrics.floorHeight;
  const tile = new PixelCanvas(BAND_WIDTH, height);
  tile.fillRect(0, 0, BAND_WIDTH, height, color);
  if (fleckColor === color) {
    return tile;
  }
  for (let cellY = 0; cellY < height; cellY += SCATTER_CELL) {
    const shift = (cellY / SCATTER_CELL) % 2 === 0 ? 0 : SCATTER_CELL / 2;
    for (let cellX = 0; cellX < BAND_WIDTH; cellX += SCATTER_CELL) {
      tile.fillRect(cellX + shift, cellY + 2, 2, 2, fleckColor);
    }
  }
  return tile;
}

function addStars(tile, seed, starlessBottomRows) {
  for (let y = 0; y < tile.height - starlessBottomRows; y++) {
    for (let x = 0; x < tile.width; x++) {
      const chance = pixelNoise(x, y, seed);
      if (chance < 0.003) {
        tile.set(x, y, 'lamp-glow');
      } else if (chance < 0.009) {
        tile.set(x, y, 'cloud');
      }
    }
  }
}

function bandSprites() {
  const sprites = [];
  for (const [time, timeBands] of Object.entries(bands)) {
    for (const [band, [color, nextColor]] of Object.entries(timeBands)) {
      const id = `${time}/${band}`;
      const isRepeatedBand = band === 'middle';
      const tile = isRepeatedBand ? scatterBand(color, nextColor) : skyBand(color, nextColor);
      if (starredBands.has(id)) {
        addStars(tile, sprites.length, isRepeatedBand ? 0 : DITHER_ROWS);
      }
      sprites.push({ id: `sky/${id}`, canvas: tile });
    }
  }
  return sprites;
}

const skylineLooks = {
  day: { body: 'sky', shade: 'sky-deep', window: 'sky-light', windowChance: 0.2 },
  dusk: { body: 'night', shade: 'night-deep', window: 'lamp', windowChance: 0.15 },
  night: { body: 'night-deep', shade: 'ink', window: 'lamp', windowChance: 0.3 },
};

// Building outlines across the backdrop, the same for every time of day.
function skylineBuildings() {
  const buildings = [];
  let left = 0;
  let index = 0;
  while (left < BACKDROP_WIDTH) {
    const width = 6 + Math.floor(pixelNoise(index, 0, 41) * 10);
    const height = 14 + Math.floor(pixelNoise(index, 1, 41) * 30);
    const hasSetback = width >= 10 && pixelNoise(index, 2, 41) < 0.5;
    const hasAntenna = height >= 36;
    buildings.push({ left, width, height, hasSetback, hasAntenna });
    left += width + Math.floor(pixelNoise(index, 3, 41) * 3);
    index++;
  }
  return buildings;
}

// The backdrop repeats sideways, so pixels past the right edge wrap to the left.
function setWrapped(canvas, x, y, color) {
  canvas.set(x % canvas.width, y, color);
}

function drawBuilding(canvas, building, look) {
  const { left, width, height, hasSetback, hasAntenna } = building;
  const bottom = canvas.height;
  const top = bottom - height;
  for (let y = top; y < bottom; y++) {
    const inset = hasSetback && y < top + 4 ? 2 : 0;
    for (let x = left + inset; x < left + width - inset; x++) {
      const isRightEdge = x === left + width - inset - 1;
      setWrapped(canvas, x, y, isRightEdge ? look.shade : look.body);
    }
  }
  for (let y = top + 6; y < bottom - 2; y += 3) {
    for (let x = left + 2; x < left + width - 2; x += 2) {
      if (pixelNoise(x, y, 42) < look.windowChance) {
        setWrapped(canvas, x, y, look.window);
      }
    }
  }
  if (hasAntenna) {
    for (let y = top - 4; y < top; y++) {
      setWrapped(canvas, left + Math.floor(width / 2), y, look.shade);
    }
  }
}

function skyline(look) {
  const canvas = new PixelCanvas(BACKDROP_WIDTH, SKYLINE_HEIGHT);
  for (const building of skylineBuildings()) {
    drawBuilding(canvas, building, look);
  }
  return canvas;
}

const hillColors = { day: 'glass', dusk: 'night', night: 'night' };

function hills(color) {
  const canvas = new PixelCanvas(BACKDROP_WIDTH, HILLS_HEIGHT);
  for (let x = 0; x < BACKDROP_WIDTH; x++) {
    const turn = (2 * Math.PI * x) / BACKDROP_WIDTH;
    const height = Math.round(8 + 4 * Math.sin(2 * turn) + 2 * Math.sin(5 * turn + 1));
    canvas.vline(x, HILLS_HEIGHT - height, height, color);
  }
  return canvas;
}

const cloudShapes = {
  'cloud-a': [
    '.......WWWW.............',
    '.....WWCCCCWW...WWW.....',
    '...WWCCCCCCCCWWWCCCWW...',
    '.WWCCCCCCCCCCCCCCCCCCWW.',
    'WCCCCCCCCCCCCCCCCCCCCCCW',
    'CCCCCCCCCCCCCCCCCCCCCCCC',
    '.SSSSCCCCCCCCCCCCCCSSSS.',
    '.....SSSSSSSSSSSSSS.....',
  ],
  'cloud-b': [
    '.....WWW........',
    '...WWCCCWWWW....',
    '.WWCCCCCCCCCWW..',
    'WCCCCCCCCCCCCCCW',
    '.SSCCCCCCCCCCSS.',
    '...SSSSSSSSSS...',
  ],
};

const cloudLooks = {
  day: { W: 'white', C: 'cloud', S: 'silver' },
  dusk: { W: 'lamp-glow', C: 'dusk', S: 'wood' },
  night: { W: 'gray', C: 'slate', S: 'night' },
};

function cloud(rows, legend) {
  const canvas = new PixelCanvas(rows[0].length, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function sun() {
  const canvas = new PixelCanvas(12, 12);
  canvas.drawMap(
    0,
    0,
    [
      '....GGGG....',
      '..GGGGGGGG..',
      '.GGGGGGGGGL.',
      '.GGGGGGGGGL.',
      'GGGGGGGGGGLL',
      'GGGGGGGGGGLL',
      'GGGGGGGGGGLL',
      'GGGGGGGGGGLL',
      '.GGGGGGGGLL.',
      '.GGGGGGGLLL.',
      '..LLLLLLLL..',
      '....LLLL....',
    ],
    { G: 'lamp-glow', L: 'lamp' },
  );
  return canvas;
}

function moon() {
  const canvas = new PixelCanvas(10, 10);
  canvas.drawMap(
    0,
    0,
    [
      '...WWWW...',
      '.WWWWWWWW.',
      '.WWCWWWWS.',
      'WWCCWWWWWS',
      'WWWWWWCWWS',
      'WWWWWCCWWS',
      'WWWWWWWWWS',
      '.WWCWWWWS.',
      '.SWWWWWSS.',
      '...SSSS...',
    ],
    { W: 'white', C: 'cloud', S: 'silver' },
  );
  return canvas;
}

function backdropSprites() {
  const sprites = [];
  for (const time of Object.keys(skylineLooks)) {
    sprites.push({ id: `sky/skyline/${time}`, canvas: skyline(skylineLooks[time]) });
    sprites.push({ id: `sky/hills/${time}`, canvas: hills(hillColors[time]) });
    for (const [subject, rows] of Object.entries(cloudShapes)) {
      sprites.push({ id: `sky/${subject}/${time}`, canvas: cloud(rows, cloudLooks[time]) });
    }
  }
  sprites.push({ id: 'sky/sun/day', canvas: sun() });
  sprites.push({ id: 'sky/moon/night', canvas: moon() });
  return sprites;
}

export const skyGroup = {
  name: 'sky',
  draw() {
    return [...bandSprites(), ...backdropSprites()];
  },
};
