import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';

const { tileWidth } = metrics;

// Small interior props that stand on the lobby floor. Each sprite is a whole
// number of tiles wide, lower than the lobby ceiling, and its bottom row rests
// on the floor. The client picks and places them (see lobbyPlan.ts).

// An ink-outlined box with a light top edge and a dark right side and bottom.
function box(tile, left, top, width, height, { fill, light, dark }) {
  tile.fillRect(left, top, width, height, fill);
  tile.hline(left + 1, top + 1, width - 2, light);
  tile.vline(left + width - 2, top + 1, height - 2, dark);
  tile.hline(left + 1, top + height - 2, width - 2, dark);
  tile.strokeRect(left, top, width, height, 'ink');
}

const wood = { fill: 'wood', light: 'wood-light', dark: 'wood-dark' };
const red = { fill: 'cloth-red', light: 'cloth-red', dark: 'wood-dark' };
const blue = { fill: 'cloth-blue', light: 'cloth-blue', dark: 'ink' };

function sideTable() {
  const tile = new PixelCanvas(tileWidth, 14);
  // lamp
  tile.hline(2, 0, 4, 'ink');
  tile.hline(1, 1, 6, 'ink');
  tile.hline(2, 1, 4, 'cloud');
  tile.hline(1, 3, 6, 'ink');
  tile.hline(2, 2, 4, 'cloud');
  tile.vline(3, 4, 2, 'gray');
  tile.vline(4, 4, 2, 'slate');
  // table
  tile.hline(0, 6, 8, 'ink');
  tile.hline(0, 7, 8, 'wood-light');
  tile.hline(0, 8, 8, 'ink');
  tile.fillRect(1, 9, 6, 4, 'wood');
  tile.vline(6, 9, 4, 'wood-dark');
  tile.vline(0, 9, 5, 'ink');
  tile.vline(7, 9, 5, 'ink');
  tile.hline(0, 13, 8, 'ink');
  tile.hline(2, 11, 4, 'wood-dark');
  return tile;
}

function lightSideTable(tile) {
  tile.hline(2, 2, 4, 'lamp-glow');
  tile.hline(2, 1, 4, 'lamp');
}

function coffeeTable() {
  const tile = new PixelCanvas(2 * tileWidth, 7);
  tile.hline(0, 0, 16, 'ink');
  tile.hline(0, 1, 16, 'wood-light');
  tile.hline(0, 2, 16, 'wood');
  tile.hline(0, 3, 16, 'ink');
  tile.vline(1, 3, 4, 'wood-dark');
  tile.vline(14, 3, 4, 'wood-dark');
  tile.vline(0, 3, 4, 'ink');
  tile.vline(2, 3, 4, 'ink');
  tile.vline(13, 3, 4, 'ink');
  tile.vline(15, 3, 4, 'ink');
  // magazine
  tile.hline(5, 0, 4, 'cloud');
  tile.hline(6, 0, 2, 'cloth-blue');
  return tile;
}

function armchair() {
  const tile = new PixelCanvas(tileWidth, 10);
  box(tile, 1, 0, 6, 7, red);
  tile.fillRect(0, 4, 8, 4, 'cloth-red');
  tile.strokeRect(0, 4, 8, 4, 'ink');
  tile.hline(1, 5, 6, 'cloth-red');
  tile.vline(6, 5, 2, 'wood-dark');
  tile.vline(2, 8, 2, 'wood-dark');
  tile.vline(5, 8, 2, 'wood-dark');
  tile.hline(1, 9, 2, 'ink');
  tile.hline(5, 9, 2, 'ink');
  return tile;
}

// A sofa `tiles` wide: backrest over a seat with an armrest at each end.
function sofa(tiles, style) {
  const width = tiles * tileWidth;
  const tile = new PixelCanvas(width, 10);
  box(tile, 1, 0, width - 2, 6, style);
  box(tile, 0, 3, width, 5, style);
  tile.hline(1, 4, width - 2, style.light);
  tile.vline(3, 1, 3, 'ink');
  tile.vline(width - 4, 1, 3, 'ink');
  if (tiles === 3) {
    tile.vline(11, 4, 3, 'ink');
    tile.vline(18, 4, 3, 'ink');
  } else {
    tile.vline(8, 4, 3, 'ink');
  }
  tile.vline(2, 8, 2, 'ink');
  tile.vline(width - 3, 8, 2, 'ink');
  tile.hline(2, 9, 1, 'ink');
  tile.hline(width - 3, 9, 1, 'ink');
  return tile;
}

function plantSmall() {
  const tile = new PixelCanvas(tileWidth, 11);
  tile.drawMap(0, 0, [
    '..i..i..',
    '.ilgilg.',
    '.igglgi.',
    '..iggi..',
    '.igigli.',
    '..iggi..',
    '...ii...',
  ], { i: 'ink', g: 'leaf', l: 'leaf-dark' });
  tile.drawMap(0, 7, [
    '.iiiiii.',
    '.iwwwwi.',
    '..iwwi..',
    '..iiii..',
  ], { i: 'ink', w: 'wood' });
  tile.hline(2, 8, 2, 'wood-light');
  return tile;
}

function plantTall() {
  const tile = new PixelCanvas(tileWidth, 20);
  tile.drawMap(0, 0, [
    '...ii...',
    '..iggi..',
    '.ilgggi.',
    '.igggli.',
    'iggliggi',
    'iglgggli',
    '.iggggi.',
    '.igligi.',
    '..iggi..',
    '...ii...',
  ], { i: 'ink', g: 'leaf', l: 'leaf-dark' });
  tile.vline(3, 10, 4, 'wood-dark');
  tile.vline(4, 10, 4, 'wood-dark');
  tile.drawMap(0, 13, [
    '.iiiiii.',
    '.iwwwwi.',
    '.iwwwwi.',
    '.iwwwdi.',
    '..iwwdi.',
    '..iwwdi.',
    '..iiiii.',
  ], { i: 'ink', w: 'wood-light', d: 'wood' });
  return tile;
}

function flowerVase() {
  const tile = new PixelCanvas(tileWidth, 14);
  // stems and blooms
  tile.set(2, 0, 'cloth-red');
  tile.set(5, 1, 'dusk');
  tile.set(3, 1, 'cloth-red');
  tile.set(4, 0, 'lamp');
  tile.vline(3, 2, 3, 'leaf');
  tile.vline(4, 2, 3, 'leaf-dark');
  tile.set(2, 3, 'leaf');
  tile.set(5, 3, 'leaf');
  // vase
  tile.drawMap(0, 4, [
    '..iiii..',
    '..igci..',
    '.iggcdi.',
    '.iggcdi.',
    '..iccdi.',
    '..iiiii.',
  ], { i: 'ink', g: 'glass', c: 'cloud', d: 'silver' });
  // pedestal
  box(tile, 1, 10, 6, 4, { fill: 'concrete-light', light: 'cloud', dark: 'concrete' });
  return tile;
}

function flowerPot() {
  const tile = new PixelCanvas(tileWidth, 11);
  tile.drawMap(0, 0, [
    '.c..r..d',
    'rcr.rrr.',
    '.l.dcd.c',
    '.lg.l.cr',
    '..gllg.c',
    '...gg...',
    '...gl...',
  ], { c: 'cloud', r: 'cloth-red', d: 'dusk', l: 'leaf', g: 'leaf-dark' });
  tile.drawMap(0, 7, [
    '.iiiiii.',
    '.iccccdi',
    '..icccdi',
    '..iccdi.',
  ], { i: 'ink', c: 'wood-light', d: 'wood' });
  return tile;
}

function receptionDesk() {
  const tile = new PixelCanvas(3 * tileWidth, 13);
  // counter top
  tile.hline(0, 4, 24, 'ink');
  tile.hline(0, 5, 24, 'wood-light');
  tile.hline(0, 6, 24, 'wood');
  tile.hline(0, 7, 24, 'ink');
  // body
  tile.fillRect(0, 8, 24, 5, 'wood');
  tile.hline(1, 8, 22, 'wood-dark');
  tile.vline(22, 8, 5, 'wood-dark');
  tile.strokeRect(0, 7, 24, 6, 'ink');
  for (const x of [5, 11, 17]) {
    tile.vline(x, 9, 3, 'wood-dark');
  }
  // bell and papers
  tile.hline(4, 3, 3, 'silver');
  tile.set(5, 2, 'gray');
  tile.hline(15, 3, 5, 'cloud');
  tile.hline(16, 2, 3, 'white');
  // sign
  tile.fillRect(9, 0, 6, 4, 'cloud');
  tile.strokeRect(9, 0, 6, 4, 'ink');
  tile.hline(10, 1, 4, 'cloth-blue');
  return tile;
}

function bench() {
  const tile = new PixelCanvas(2 * tileWidth, 8);
  tile.hline(0, 0, 16, 'ink');
  tile.hline(0, 1, 16, 'wood-light');
  tile.hline(0, 2, 16, 'wood');
  tile.hline(0, 3, 16, 'ink');
  tile.hline(0, 4, 16, 'wood-light');
  tile.hline(0, 5, 16, 'wood-dark');
  tile.vline(1, 5, 3, 'ink');
  tile.vline(2, 5, 3, 'wood-dark');
  tile.vline(13, 5, 3, 'wood-dark');
  tile.vline(14, 5, 3, 'ink');
  tile.hline(0, 7, 4, 'ink');
  tile.hline(12, 7, 4, 'ink');
  tile.vline(0, 3, 2, 'ink');
  tile.vline(15, 3, 2, 'ink');
  tile.hline(0, 6, 1, 'ink');
  tile.hline(15, 6, 1, 'ink');
  return tile;
}

function floorLamp() {
  const tile = new PixelCanvas(tileWidth, 20);
  tile.drawMap(0, 0, [
    '..iiii..',
    '.icccci.',
    '.iccwci.',
    'iccccwci',
    'iiiiiiii',
  ], { i: 'ink', c: 'cloud', w: 'white' });
  tile.vline(3, 5, 12, 'gray');
  tile.vline(4, 5, 12, 'slate');
  tile.hline(1, 17, 6, 'slate');
  tile.hline(2, 18, 4, 'gray');
  tile.hline(1, 19, 6, 'ink');
  return tile;
}

function lightFloorLamp(tile) {
  tile.hline(2, 1, 4, 'lamp');
  tile.hline(2, 2, 4, 'lamp-glow');
  tile.hline(1, 3, 6, 'lamp');
}

function noticeBoard() {
  const tile = new PixelCanvas(tileWidth, 18);
  box(tile, 0, 0, 8, 11, wood);
  tile.fillRect(1, 1, 6, 9, 'concrete-light');
  tile.fillRect(1, 1, 3, 3, 'cloud');
  tile.fillRect(4, 3, 3, 4, 'white');
  tile.fillRect(2, 6, 3, 3, 'cloud');
  tile.set(2, 1, 'cloth-red');
  tile.set(5, 3, 'cloth-blue');
  tile.set(3, 6, 'cloth-red');
  tile.strokeRect(0, 0, 8, 11, 'ink');
  tile.vline(2, 11, 6, 'ink');
  tile.vline(5, 11, 6, 'ink');
  tile.vline(3, 11, 6, 'wood-dark');
  tile.vline(4, 11, 6, 'wood');
  tile.hline(1, 17, 6, 'ink');
  return tile;
}

function umbrellaStand() {
  const tile = new PixelCanvas(tileWidth, 12);
  tile.drawMap(0, 0, [
    '..i.....',
    '.ibi.i..',
    '.ibi.ri.',
    '..i.irri',
    '..i..i.i',
  ], { i: 'ink', b: 'cloth-blue', r: 'cloth-red' });
  tile.vline(3, 5, 2, 'slate');
  tile.vline(5, 5, 2, 'slate');
  tile.drawMap(0, 6, [
    '.iiiiii.',
    '.igggsi.',
    '.igggsi.',
    '.igggsi.',
    '.igggsi.',
    '.iggssi.',
    '.iiiiii.',
  ], { i: 'ink', g: 'gray', s: 'slate' });
  return tile;
}

export const lobbyProps = [
  { subject: 'side-table', draw: sideTable, lightUp: lightSideTable },
  { subject: 'coffee-table', draw: coffeeTable },
  { subject: 'armchair', draw: armchair },
  { subject: 'loveseat', draw: () => sofa(2, blue) },
  { subject: 'sofa', draw: () => sofa(3, red) },
  { subject: 'plant-small', draw: plantSmall },
  { subject: 'plant-tall', draw: plantTall },
  { subject: 'flower-vase', draw: flowerVase },
  { subject: 'flower-pot', draw: flowerPot },
  { subject: 'reception-desk', draw: receptionDesk },
  { subject: 'bench', draw: bench },
  { subject: 'floor-lamp', draw: floorLamp, lightUp: lightFloorLamp },
  { subject: 'notice-board', draw: noticeBoard },
  { subject: 'umbrella-stand', draw: umbrellaStand },
];

export const lobbyGroup = {
  name: 'lobby',
  draw() {
    return lobbyProps.flatMap(({ subject, draw, lightUp }) => {
      const day = draw();
      const night = toNight(day);
      lightUp?.(night);
      return [
        { id: `lobby/${subject}/day`, canvas: day },
        { id: `lobby/${subject}/night`, canvas: night },
      ];
    });
  },
};
