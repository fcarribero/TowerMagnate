import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';

const { tileWidth } = metrics;

// Props that stand on the parapet of a roof with nothing built above it. Each
// sprite is a whole number of tiles wide and its bottom row rests on the
// parapet. The client picks and places them (see rooftopPlan.ts).

// An ink-outlined box with a light top edge and a dark right side and bottom.
function box(tile, left, top, width, height, { fill, light, dark }) {
  tile.fillRect(left, top, width, height, fill);
  tile.hline(left + 1, top + 1, width - 2, light);
  tile.vline(left + width - 2, top + 1, height - 2, dark);
  tile.hline(left + 1, top + height - 2, width - 2, dark);
  tile.strokeRect(left, top, width, height, 'ink');
}

const metal = { fill: 'gray', light: 'silver', dark: 'slate' };
const concrete = { fill: 'concrete', light: 'concrete-light', dark: 'concrete-dark' };

function fan(tile, left, top) {
  tile.fillRect(left, top, 4, 4, 'slate');
  tile.hline(left, top + 1, 4, 'gray');
  tile.vline(left + 1, top, 4, 'gray');
  tile.set(left + 3, top + 3, 'ink');
}

function vent() {
  const tile = new PixelCanvas(tileWidth, 6);
  tile.hline(1, 0, 6, 'ink');
  tile.hline(1, 1, 6, 'silver');
  tile.hline(2, 2, 4, 'gray');
  tile.fillRect(2, 3, 4, 3, 'gray');
  tile.vline(5, 3, 3, 'slate');
  tile.vline(1, 2, 4, 'ink');
  tile.vline(6, 2, 4, 'ink');
  tile.hline(0, 5, 8, 'ink');
  return tile;
}

function antenna() {
  const tile = new PixelCanvas(tileWidth, 18);
  tile.vline(3, 0, 18, 'gray');
  tile.vline(4, 1, 17, 'slate');
  tile.hline(1, 4, 6, 'gray');
  tile.hline(2, 8, 4, 'gray');
  tile.hline(0, 12, 8, 'silver');
  tile.fillRect(1, 15, 6, 3, 'slate');
  tile.hline(1, 15, 6, 'gray');
  tile.hline(0, 17, 8, 'ink');
  return tile;
}

function lightAntenna(tile) {
  tile.set(3, 0, 'lamp-glow');
  tile.set(4, 0, 'lamp');
}

function stack() {
  const tile = new PixelCanvas(tileWidth, 11);
  box(tile, 1, 2, 6, 9, concrete);
  tile.hline(0, 0, 8, 'ink');
  tile.hline(0, 1, 8, 'concrete-light');
  tile.hline(0, 2, 8, 'ink');
  tile.hline(1, 6, 6, 'concrete-dark');
  return tile;
}

function airConditioner() {
  const tile = new PixelCanvas(2 * tileWidth, 9);
  box(tile, 0, 1, 16, 8, metal);
  fan(tile, 2, 3);
  fan(tile, 7, 3);
  tile.vline(12, 3, 4, 'silver');
  tile.vline(14, 3, 4, 'silver');
  return tile;
}

function airConditionerBank() {
  const tile = new PixelCanvas(3 * tileWidth, 9);
  box(tile, 0, 1, 24, 8, metal);
  tile.vline(11, 2, 6, 'ink');
  fan(tile, 3, 3);
  fan(tile, 15, 3);
  tile.vline(8, 3, 4, 'silver');
  tile.vline(20, 3, 4, 'silver');
  return tile;
}

function waterTank() {
  const tile = new PixelCanvas(2 * tileWidth, 16);
  tile.hline(6, 0, 4, 'ink');
  tile.hline(4, 1, 8, 'ink');
  tile.fillRect(5, 1, 6, 1, 'wood-light');
  tile.fillRect(2, 2, 12, 9, 'wood');
  tile.vline(3, 2, 9, 'wood-light');
  tile.vline(12, 2, 9, 'wood-dark');
  tile.hline(2, 5, 12, 'wood-dark');
  tile.hline(2, 8, 12, 'wood-dark');
  tile.vline(1, 2, 9, 'ink');
  tile.vline(14, 2, 9, 'ink');
  tile.hline(2, 11, 12, 'ink');
  tile.vline(3, 12, 4, 'slate');
  tile.vline(12, 12, 4, 'slate');
  tile.hline(6, 12, 4, 'slate');
  tile.vline(7, 13, 3, 'gray');
  tile.hline(2, 15, 12, 'ink');
  return tile;
}

function satelliteDish() {
  const tile = new PixelCanvas(2 * tileWidth, 11);
  const rows = [
    '.....iiiii......',
    '...iivvvvvii....',
    '..ivvcccccvgi...',
    '..ivccwcccvgi...',
    '..ivcccccvggi...',
    '...iivvvvggi.i..',
    '.....iiiiiiis...',
    '..........gs....',
    '........ggggs...',
    '.......iggggsi..',
    '.......iiiiiii..',
  ];
  tile.drawMap(0, 0, rows, {
    i: 'ink',
    v: 'silver',
    c: 'cloud',
    w: 'white',
    g: 'gray',
    s: 'slate',
  });
  return tile;
}

function penthouse() {
  const tile = new PixelCanvas(3 * tileWidth, 13);
  box(tile, 0, 2, 24, 11, concrete);
  tile.hline(0, 0, 24, 'ink');
  tile.hline(0, 1, 24, 'concrete-light');
  tile.hline(0, 2, 24, 'ink');
  tile.fillRect(14, 6, 6, 7, 'wood-dark');
  tile.strokeRect(14, 6, 6, 7, 'ink');
  tile.vline(18, 9, 2, 'lamp');
  tile.fillRect(3, 6, 5, 3, 'night-deep');
  tile.strokeRect(3, 6, 5, 3, 'ink');
  tile.hline(4, 7, 3, 'glass');
  return tile;
}

export const rooftopProps = [
  { subject: 'vent', draw: vent },
  { subject: 'antenna', draw: antenna, lightUp: lightAntenna },
  { subject: 'stack', draw: stack },
  { subject: 'air-conditioner', draw: airConditioner },
  { subject: 'dish', draw: satelliteDish },
  { subject: 'water-tank', draw: waterTank },
  { subject: 'air-conditioner-bank', draw: airConditionerBank },
  { subject: 'penthouse', draw: penthouse },
];

export const rooftopGroup = {
  name: 'rooftop',
  draw() {
    return rooftopProps.flatMap(({ subject, draw, lightUp }) => {
      const day = draw();
      const night = toNight(day);
      lightUp?.(night);
      return [
        { id: `rooftop/${subject}/day`, canvas: day },
        { id: `rooftop/${subject}/night`, canvas: night },
      ];
    });
  },
};
