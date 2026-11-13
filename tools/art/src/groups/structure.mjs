import { toBurnt } from '../burnt.mjs';
import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';
import { pixelNoise } from '../noise.mjs';

const { tileWidth, floorHeight, slabHeight } = metrics;
const EDGE_WIDTH = 3;
const ROOF_HEIGHT = 4;
const SOIL_TILE_WIDTH = 512;

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
  tile.fillRect(2, top + 1, 4, bottom - top - 1, 0);
  for (let y = top + 10; y <= bottom - 8; y += 10) {
    tile.hline(2, y, 4, 'gray');
  }
}

// One column of lobby, 1 to 3 floors tall. With `window: false` the wall is
// solid: most of a lobby is wall and the client puts a pane of windows only
// every few tiles.
function lobby(floors, { window = true } = {}) {
  const tile = new PixelCanvas(tileWidth, floors * floorHeight);
  const slabTop = slabTopOf(tile);
  const wainscotTop = slabTop - 6;
  tile.fillRect(0, 0, tileWidth, slabTop, 'concrete-light');
  tile.hline(0, 0, tileWidth, 'concrete');
  tile.hline(0, 1, tileWidth, 'concrete-dark');
  tile.hline(0, 6, tileWidth, 'concrete');
  if (window) {
    drawLobbyWindow(tile, 9, wainscotTop - 3);
  } else {
    tile.vline(0, 7, wainscotTop - 7, 'concrete');
  }
  tile.hline(0, wainscotTop, tileWidth, 'wood-light');
  tile.fillRect(0, wainscotTop + 1, tileWidth, 4, 'wood');
  tile.hline(0, slabTop - 1, tileWidth, 'wood-dark');
  drawSlab(tile, ['white', 'concrete-light']);
  drawPendantLamp(tile);
  return tile;
}

// Sky lobby: a glass band with the view outside, a handrail and parquet.
function skyLobby() {
  const tile = new PixelCanvas(tileWidth, floorHeight);
  const slabTop = slabTopOf(tile);
  tile.fillRect(0, 0, tileWidth, slabTop, 'silver');
  tile.hline(0, 0, tileWidth, 'slate');
  tile.hline(0, 1, tileWidth, 'gray');
  tile.fillRect(0, 4, tileWidth, 15, 0);
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
  tile.hline(3, 2, 2, 'silver');
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

function speckle(tile, top, color, chance, seed) {
  for (let y = top; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      if (pixelNoise(x, y, seed) < chance) {
        tile.set(x, y, color);
      }
    }
  }
}

// The soil is one picture cut into nine levels, S1 at the top. A level tile is 512 px wide so the
// pattern repeats about six times across the site, and its rows continue the rows of the level
// above, so the colors blend from level to level instead of changing in steps.
const SOIL_LEVELS = 9;
const SOIL_COLORS = ['wood', 'wood-dark', 'concrete-dark', 'charcoal'];
const SOIL_DEPTH_ROWS = SOIL_LEVELS * floorHeight;

// A smooth value between 0 and 1 along x that wraps at the tile width: the soil gets a little
// lighter and darker from side to side without any visible repeat of a small tile.
function soilWave(x, width, seed) {
  const cell = 64;
  const cells = width / cell;
  const left = Math.floor(x / cell);
  const blend = (x % cell) / cell;
  const soft = blend * blend * (3 - 2 * blend);
  const a = pixelNoise(left % cells, 0, seed);
  const b = pixelNoise((left + 1) % cells, 0, seed);
  return a + (b - a) * soft;
}

function soilColorAt(x, y, depthRow) {
  const sideways = (soilWave(x, SOIL_TILE_WIDTH, 71) - 0.5) * 0.12;
  const t = Math.min(Math.max(depthRow / SOIL_DEPTH_ROWS + sideways, 0), 1);
  const position =
    t * (SOIL_COLORS.length - 1) + (pixelNoise(Math.floor(x / 2), y, 72) - 0.5) * 0.6;
  const index = Math.min(Math.max(Math.round(position), 0), SOIL_COLORS.length - 1);
  return SOIL_COLORS[index];
}

// Soft streaks that wander sideways, a few over the whole depth.
function drawStrata(tile, level) {
  const first = (level - 1) * floorHeight;
  for (const seamRow of [34, 79, 128, 177, 221, 262]) {
    const phase = seamRow * 0.37;
    for (let x = 0; x < tile.width; x++) {
      const wave = Math.sin((x / tile.width) * 2 * Math.PI * 3 + phase) * 2.5;
      const y = Math.round(seamRow + wave) - first;
      if (y < 0 || y >= tile.height || pixelNoise(Math.floor(x / 4), seamRow, 73) > 0.6) {
        continue;
      }
      tile.set(x, y, pixelNoise(x, seamRow, 74) < 0.5 ? 'wood-dark' : 'slate');
    }
  }
}

function drawSoilStones(tile, level) {
  const first = (level - 1) * floorHeight;
  const count = 6 + level * 2;
  for (let index = 0; index < count; index++) {
    const left = Math.floor(pixelNoise(index, level, 75) * (tile.width - 3));
    const top = Math.floor(pixelNoise(index, level, 76) * (tile.height - 3));
    const darkness = (first + top) / SOIL_DEPTH_ROWS;
    const rock =
      darkness > 0.5 ? ['gray', 'slate', 'charcoal'] : ['concrete', 'concrete-dark', 'wood-dark'];
    tile.drawMap(left, top, ['LB.', 'BBD', '.DD'], { L: rock[0], B: rock[1], D: rock[2] });
  }
}

function drawGrass(tile) {
  for (let x = 0; x < tile.width; x++) {
    tile.set(x, 0, pixelNoise(x, 0, 12) < 0.3 ? 'leaf-dark' : 'leaf');
    tile.set(x, 1, 'leaf-dark');
    if (pixelNoise(x, 2, 13) < 0.25) {
      tile.set(x, 2, 'leaf-dark');
    }
  }
}

function soilLevel(level) {
  const tile = new PixelCanvas(SOIL_TILE_WIDTH, floorHeight);
  const first = (level - 1) * floorHeight;
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      tile.set(x, y, soilColorAt(x, y, first + y));
    }
  }
  drawStrata(tile, level);
  speckle(tile, 0, 'wood-light', Math.max(0.05 - level * 0.006, 0.004), 77 + level);
  speckle(tile, 0, 'ink', 0.004 + level * 0.002, 90 + level);
  drawSoilStones(tile, level);
  if (level === 1) {
    drawGrass(tile);
  }
  return tile;
}

function drawTunnelLining(tile) {
  tile.hline(0, 0, tileWidth, 'charcoal');
  tile.hline(0, 1, tileWidth, 'concrete-light');
  tile.hline(0, 2, tileWidth, 'concrete');
  tile.hline(0, 3, tileWidth, 'concrete-dark');
}

function drawTunnelWall(tile) {
  tile.fillRect(0, 4, tileWidth, 19, 'slate');
  tile.vline(tileWidth - 1, 4, 19, 'charcoal');
  tile.hline(0, 4, tileWidth, 'charcoal');
  tile.hline(0, 12, tileWidth - 1, 'gray');
  tile.hline(0, 13, tileWidth, 'charcoal');
}

function drawTrack(tile) {
  tile.hline(0, 23, tileWidth, 'charcoal');
  tile.hline(0, 24, tileWidth, 'silver');
  tile.hline(0, 25, tileWidth, 'gray');
  tile.fillRect(0, 26, 6, 1, 'wood-dark');
  tile.fillRect(6, 26, 2, 1, 'slate');
  for (let x = 0; x < tileWidth; x++) {
    tile.set(x, 27, pixelNoise(x, 27, 61) < 0.5 ? 'gray' : 'slate');
    tile.set(x, 28, pixelNoise(x, 28, 61) < 0.3 ? 'gray' : 'slate');
  }
}

// One column of the S10 subway tunnel. It is lit day and night; with `lamp`,
// a wall lamp hangs under the ceiling (the client places one every few tiles).
function subwayTunnel({ lamp }) {
  const tile = new PixelCanvas(tileWidth, floorHeight);
  drawTunnelLining(tile);
  drawTunnelWall(tile);
  drawTrack(tile);
  drawSlab(tile, ['concrete', 'concrete-dark']);
  if (lamp) {
    tile.hline(2, 4, 4, 'gray');
    tile.hline(2, 5, 4, 'lamp');
    tile.hline(3, 6, 2, 'lamp-glow');
  }
  return tile;
}

const PORTAL_WIDTH = 3;

// The end of the S10 tunnel where it meets the soil: a concrete bulkhead on the
// outer side, the lining and track running into it.
function subwayTunnelEdge(side) {
  const tile = subwayTunnel({ lamp: false });
  const slabTop = slabTopOf(tile);
  const ramp = ['concrete-light', 'concrete', 'concrete-dark'];
  const outerX = side === 'left' ? 0 : tileWidth - PORTAL_WIDTH;
  ramp.forEach((color, step) => tile.vline(outerX + step, 0, slabTop, color));
  const innerX = side === 'left' ? PORTAL_WIDTH : tileWidth - PORTAL_WIDTH - 1;
  tile.vline(innerX, 4, slabTop - 4, 'charcoal');
  tile.set(outerX + 1, 8, 'concrete-dark');
  tile.set(outerX + 1, 18, 'concrete-dark');
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

// The exterior wall carried up to about a person's waist above the top roof, as a railing.
const PARAPET_HEIGHT = 8;

function parapet(side) {
  const tile = new PixelCanvas(EDGE_WIDTH, PARAPET_HEIGHT);
  const outer = side === 'left' ? 0 : EDGE_WIDTH - 1;
  const inner = side === 'left' ? EDGE_WIDTH - 1 : 0;
  tile.fillRect(0, 0, EDGE_WIDTH, PARAPET_HEIGHT, 'concrete');
  tile.vline(inner, 1, PARAPET_HEIGHT - 1, 'concrete-light');
  tile.hline(0, 0, EDGE_WIDTH, 'ink');
  tile.hline(0, 1, EDGE_WIDTH, 'concrete-light');
  tile.vline(outer, 0, PARAPET_HEIGHT, 'ink');
  return tile;
}

// A glass double door for each end of the main lobby: two leaves in a metal frame with
// handles in the middle, standing on the lobby floor.
const DOOR_WIDTH = 16;
const DOOR_HEIGHT = 24;

function lobbyDoor() {
  const tile = new PixelCanvas(DOOR_WIDTH, DOOR_HEIGHT);
  tile.fillRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT, 'slate');
  tile.strokeRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT, 'ink');
  tile.hline(1, 1, DOOR_WIDTH - 2, 'silver');
  const paneTop = 3;
  const paneHeight = DOOR_HEIGHT - paneTop - 2;
  for (const left of [2, 9]) {
    tile.fillRect(left, paneTop, 5, paneHeight, 'glass');
    tile.strokeRect(left - 1, paneTop - 1, 7, paneHeight + 2, 'gray');
    tile.vline(left + 1, paneTop + 1, 5, 'sky-light');
    tile.vline(left + 2, paneTop + 4, 4, 'sky-light');
    tile.hline(left, paneTop + paneHeight - 4, 5, 'gray');
  }
  tile.vline(7, 2, DOOR_HEIGHT - 3, 'ink');
  tile.vline(8, 2, DOOR_HEIGHT - 3, 'ink');
  tile.vline(6, 11, 4, 'lamp');
  tile.vline(9, 11, 4, 'lamp');
  tile.hline(0, 0, DOOR_WIDTH, 'ink');
  return tile;
}

// Each entry draws the day sprite; night is the same drawing one ramp step darker,
// with the lights switched on by `lightUp`.
const subjects = [
  { subject: 'floor', draw: bareFloor },
  { subject: 'ruins', draw: () => toBurnt(bareFloor()) },
  { subject: 'lobby-1', draw: () => lobby(1), lightUp: lightPendantLamp },
  {
    subject: 'lobby-1-wall',
    draw: () => lobby(1, { window: false }),
    lightUp: lightPendantLamp,
  },
  { subject: 'lobby-2', draw: () => lobby(2), lightUp: lightPendantLamp },
  {
    subject: 'lobby-2-wall',
    draw: () => lobby(2, { window: false }),
    lightUp: lightPendantLamp,
  },
  { subject: 'lobby-3', draw: () => lobby(3), lightUp: lightPendantLamp },
  {
    subject: 'lobby-3-wall',
    draw: () => lobby(3, { window: false }),
    lightUp: lightPendantLamp,
  },
  { subject: 'sky-lobby', draw: () => skyLobby(), lightUp: lightSkyLobby },
  { subject: 'basement', draw: basement },
  ...Array.from({ length: SOIL_LEVELS }, (_, index) => ({
    subject: `soil-${index + 1}`,
    draw: () => soilLevel(index + 1),
  })),
  { subject: 'subway-tunnel', draw: () => subwayTunnel({ lamp: false }) },
  { subject: 'subway-tunnel-lamp', draw: () => subwayTunnel({ lamp: true }) },
  { subject: 'subway-tunnel-edge-left', draw: () => subwayTunnelEdge('left') },
  { subject: 'subway-tunnel-edge-right', draw: () => subwayTunnelEdge('right') },
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
  { subject: 'lobby-door', draw: lobbyDoor },
  { subject: 'parapet-left', draw: () => parapet('left') },
  { subject: 'parapet-right', draw: () => parapet('right') },
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
