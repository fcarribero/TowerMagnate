import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';
import { pixelNoise } from '../noise.mjs';

const { tileWidth, floorHeight, slabHeight } = metrics;
const EDGE_WIDTH = 3;
const ROOF_HEIGHT = 4;
const SOIL_TILE_WIDTH = 32;

function slabTopOf(tile) {
  return tile.height - slabHeight;
}

function drawSlab(tile, topRowColors = ['concrete-light']) {
  const top = slabTopOf(tile);
  for (let x = 0; x < tile.width; x++) {
    tile.set(x, top, topRowColors[Math.floor(x / 4) % topRowColors.length]);
  }
  tile.hline(0, top + 1, tile.width, 'concrete');
  tile.hline(0, top + 2, tile.width, 'concrete-dark');
}

// A built floor with nothing on it yet.
function bareFloor() {
  const tile = new PixelCanvas(tileWidth, floorHeight);
  const slabTop = slabTopOf(tile);
  tile.fillRect(0, 0, tileWidth, slabTop, 'silver');
  tile.hline(0, 0, tileWidth, 'gray');
  tile.vline(tileWidth - 1, 1, slabTop - 2, 'gray');
  tile.hline(0, slabTop - 1, tileWidth, 'gray');
  drawSlab(tile);
  return tile;
}

function drawPendantLamp(tile) {
  tile.hline(3, 2, 2, 'gray');
  tile.hline(2, 3, 4, 'slate');
  tile.hline(3, 4, 2, 'lamp');
}

function lightPendantLamp(tile) {
  tile.hline(3, 4, 2, 'lamp-glow');
  tile.hline(2, 5, 4, 'lamp');
}

function drawLobbyWindow(tile, top, bottom) {
  tile.fillRect(1, top, 6, bottom - top + 1, 'gray');
  tile.fillRect(2, top + 1, 4, bottom - top - 1, 'glass');
  for (let y = top + 10; y <= bottom - 8; y += 10) {
    tile.hline(2, y, 4, 'gray');
  }
}

function drawMarbleColumn(tile) {
  const slabTop = slabTopOf(tile);
  tile.fillRect(2, 2, 4, slabTop - 2, 'cloud');
  tile.vline(2, 2, slabTop - 2, 'white');
  tile.vline(5, 2, slabTop - 2, 'silver');
  tile.hline(1, 2, 6, 'white');
  tile.hline(1, 3, 6, 'silver');
  tile.hline(1, slabTop - 2, 6, 'cloud');
  tile.hline(1, slabTop - 1, 6, 'silver');
}

// One column of lobby, 1 to 3 floors tall. With `column`, a marble column
// covers the window; the client places it every few tiles.
function lobby(floors, { column }) {
  const tile = new PixelCanvas(tileWidth, floors * floorHeight);
  const slabTop = slabTopOf(tile);
  const wainscotTop = slabTop - 6;
  tile.fillRect(0, 0, tileWidth, slabTop, 'concrete-light');
  tile.hline(0, 0, tileWidth, 'concrete');
  tile.hline(0, 1, tileWidth, 'concrete-dark');
  tile.hline(0, 6, tileWidth, 'concrete');
  drawLobbyWindow(tile, 9, wainscotTop - 3);
  tile.hline(0, wainscotTop, tileWidth, 'wood-light');
  tile.fillRect(0, wainscotTop + 1, tileWidth, 4, 'wood');
  tile.hline(0, slabTop - 1, tileWidth, 'wood-dark');
  drawSlab(tile, ['white', 'concrete-light']);
  if (column) {
    drawMarbleColumn(tile);
  } else {
    drawPendantLamp(tile);
  }
  return tile;
}

function drawSteelColumn(tile) {
  const slabTop = slabTopOf(tile);
  tile.fillRect(2, 2, 4, slabTop - 2, 'gray');
  tile.vline(2, 2, slabTop - 2, 'silver');
  tile.vline(5, 2, slabTop - 2, 'slate');
  tile.hline(1, slabTop - 1, 6, 'slate');
}

// Sky lobby: a glass band with the view outside, a handrail and parquet.
function skyLobby({ column }) {
  const tile = new PixelCanvas(tileWidth, floorHeight);
  const slabTop = slabTopOf(tile);
  tile.fillRect(0, 0, tileWidth, slabTop, 'silver');
  tile.hline(0, 0, tileWidth, 'slate');
  tile.hline(0, 1, tileWidth, 'gray');
  tile.fillRect(0, 4, tileWidth, 15, 'glass');
  tile.hline(0, 3, tileWidth, 'gray');
  tile.hline(0, 19, tileWidth, 'gray');
  tile.vline(0, 4, 15, 'gray');
  tile.hline(0, 21, tileWidth, 'wood-light');
  tile.vline(0, 22, slabTop - 22, 'wood');
  tile.vline(4, 22, slabTop - 22, 'wood');
  drawSlab(tile, ['wood-light', 'wood']);
  for (let x = 2; x < tileWidth; x += 4) {
    tile.set(x, slabTop, 'wood-light');
  }
  if (column) {
    drawSteelColumn(tile);
  } else {
    tile.hline(3, 2, 2, 'silver');
  }
  return tile;
}

function lightSkyLobby(tile) {
  tile.hline(3, 2, 2, 'lamp-glow');
}

function drawBasementBlocks(tile) {
  const slabTop = slabTopOf(tile);
  const blockHeight = 8;
  for (let y = 7; y < slabTop; y += blockHeight) {
    tile.hline(0, y, tileWidth, 'concrete');
  }
  for (let band = 0; band * blockHeight < slabTop; band++) {
    const seamX = band % 2 === 0 ? 0 : 4;
    tile.vline(seamX, band * blockHeight, blockHeight - 1, 'concrete');
  }
}

// An excavated basement level with nothing on it yet.
function basement() {
  const tile = new PixelCanvas(tileWidth, floorHeight);
  const slabTop = slabTopOf(tile);
  tile.fillRect(0, 0, tileWidth, slabTop, 'concrete-dark');
  drawBasementBlocks(tile);
  tile.hline(0, 0, tileWidth, 'charcoal');
  tile.hline(0, 2, tileWidth, 'silver');
  tile.hline(0, 3, tileWidth, 'gray');
  tile.set(6, 1, 'slate');
  drawSlab(tile);
  return tile;
}

function drawStone(tile, left, top) {
  tile.drawMap(left, top, ['LB.', 'BBD', '.DD'], {
    L: 'concrete-light',
    B: 'concrete',
    D: 'concrete-dark',
  });
}

function scatterStones(tile, top, count, seed) {
  for (let index = 0; index < count; index++) {
    const left = Math.floor(pixelNoise(index, 0, seed) * (tile.width - 3));
    const stoneTop = top + Math.floor(pixelNoise(index, 1, seed) * (tile.height - top - 3));
    drawStone(tile, left, stoneTop);
  }
}

function speckle(tile, top, color, chance, seed) {
  for (let y = top; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      if (pixelNoise(x, y, seed) < chance) {
        tile.set(x, y, color);
      }
    }
  }
}

// The soil level right under ground level, with grass on top.
function ground() {
  const tile = new PixelCanvas(SOIL_TILE_WIDTH, floorHeight);
  tile.fillRect(0, 0, tile.width, tile.height, 'wood-dark');
  for (let x = 0; x < tile.width; x++) {
    const topsoilBottom = 8 + Math.floor(pixelNoise(x, 0, 11) * 3);
    tile.vline(x, 2, topsoilBottom - 2, 'wood');
    tile.set(x, 0, pixelNoise(x, 0, 12) < 0.3 ? 'leaf-dark' : 'leaf');
    tile.set(x, 1, 'leaf-dark');
    if (pixelNoise(x, 2, 13) < 0.25) {
      tile.set(x, 2, 'leaf-dark');
    }
  }
  speckle(tile, 3, 'wood-light', 0.04, 14);
  speckle(tile, 12, 'charcoal', 0.06, 15);
  scatterStones(tile, 14, 3, 16);
  return tile;
}

function dirt() {
  const tile = new PixelCanvas(SOIL_TILE_WIDTH, floorHeight);
  tile.fillRect(0, 0, tile.width, tile.height, 'wood-dark');
  speckle(tile, 0, 'charcoal', 0.08, 21);
  speckle(tile, 0, 'wood', 0.03, 22);
  scatterStones(tile, 0, 4, 23);
  return tile;
}

// Deeper soil for the lowest basement levels: darker, with more rock.
function deepDirt() {
  const tile = new PixelCanvas(SOIL_TILE_WIDTH, floorHeight);
  tile.fillRect(0, 0, tile.width, tile.height, 'charcoal');
  speckle(tile, 0, 'wood-dark', 0.1, 31);
  speckle(tile, 0, 'slate', 0.04, 32);
  scatterStones(tile, 0, 7, 33);
  return tile;
}

function wallEdge(colorsLeftToRight, jointColor) {
  const tile = new PixelCanvas(EDGE_WIDTH, floorHeight);
  colorsLeftToRight.forEach((color, x) => tile.vline(x, 0, floorHeight, color));
  const slabTop = floorHeight - slabHeight;
  for (let x = 0; x < EDGE_WIDTH; x++) {
    if (colorsLeftToRight[x] !== 'ink') {
      tile.set(x, slabTop, jointColor);
    }
  }
  return tile;
}

function roof() {
  const tile = new PixelCanvas(tileWidth, ROOF_HEIGHT);
  tile.hline(0, 0, tileWidth, 'ink');
  tile.hline(0, 1, tileWidth, 'concrete-light');
  tile.hline(0, 2, tileWidth, 'concrete');
  tile.hline(0, 3, tileWidth, 'concrete-dark');
  return tile;
}

function roofCorner(side) {
  const tile = new PixelCanvas(EDGE_WIDTH, ROOF_HEIGHT);
  tile.stamp(roof(), 0, 0);
  tile.vline(side === 'left' ? 0 : EDGE_WIDTH - 1, 0, ROOF_HEIGHT, 'ink');
  return tile;
}

// Each entry draws the day sprite; night is the same drawing one ramp step darker,
// with the lights switched on by `lightUp`.
const subjects = [
  { subject: 'floor', draw: bareFloor },
  { subject: 'lobby-1', draw: () => lobby(1, { column: false }), lightUp: lightPendantLamp },
  { subject: 'lobby-1-column', draw: () => lobby(1, { column: true }) },
  { subject: 'lobby-2', draw: () => lobby(2, { column: false }), lightUp: lightPendantLamp },
  { subject: 'lobby-2-column', draw: () => lobby(2, { column: true }) },
  { subject: 'lobby-3', draw: () => lobby(3, { column: false }), lightUp: lightPendantLamp },
  { subject: 'lobby-3-column', draw: () => lobby(3, { column: true }) },
  { subject: 'sky-lobby', draw: () => skyLobby({ column: false }), lightUp: lightSkyLobby },
  { subject: 'sky-lobby-column', draw: () => skyLobby({ column: true }) },
  { subject: 'basement', draw: basement },
  { subject: 'ground', draw: ground },
  { subject: 'dirt', draw: dirt },
  { subject: 'dirt-deep', draw: deepDirt },
  {
    subject: 'edge-left',
    draw: () => wallEdge(['ink', 'concrete-light', 'concrete'], 'concrete-dark'),
  },
  {
    subject: 'edge-right',
    draw: () => wallEdge(['concrete', 'concrete-dark', 'ink'], 'concrete-dark'),
  },
  {
    subject: 'basement-edge-left',
    draw: () => wallEdge(['ink', 'concrete', 'concrete-dark'], 'charcoal'),
  },
  {
    subject: 'basement-edge-right',
    draw: () => wallEdge(['concrete-dark', 'charcoal', 'ink'], 'ink'),
  },
  { subject: 'roof', draw: roof },
  { subject: 'roof-left', draw: () => roofCorner('left') },
  { subject: 'roof-right', draw: () => roofCorner('right') },
];

function nightVersion(dayCanvas, lightUp) {
  const night = toNight(dayCanvas);
  lightUp?.(night);
  return night;
}

export const structureGroup = {
  name: 'structure',
  draw() {
    return subjects.flatMap(({ subject, draw, lightUp }) => {
      const day = draw();
      return [
        { id: `structure/${subject}/day`, canvas: day },
        { id: `structure/${subject}/night`, canvas: nightVersion(day, lightUp) },
      ];
    });
  },
};
