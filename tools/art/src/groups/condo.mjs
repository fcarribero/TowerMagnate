import { PixelCanvas } from '../canvas.mjs';
import {
  bookshelf,
  clock,
  legend as officeLegend,
  pictureSmall,
  pictureWide,
  plantMedium,
  plantTall,
  propSprites,
  wallShelf,
} from './office.mjs';

// Condo props that the client places on top of the bare condo room (units/condo/empty_day),
// like the office props. Looks: `idle` always; `busy` when the condo is occupied and the prop
// changes (lamps lit, TV on); `sleep` when someone is asleep in it (the bed, slept in but empty).
// The sizes here must match the condo catalog in apps/web/src/render/interior/condo.ts.

const legend = { ...officeLegend, n: 'night', B: 'sky' };

function map(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = new PixelCanvas(width, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function blank(width, height) {
  return new PixelCanvas(width, height);
}

function idle(canvas) {
  return { idle: canvas };
}

// A lamp shade, 5 wide and 3 tall, lit or not.
function lampShade(canvas, left, top, lit) {
  canvas.drawMap(left, top, ['.ooo.', 'ooooo', 'ooooo'], { o: lit ? 'lamp-glow' : 'cloud' });
  if (lit) canvas.hline(left + 1, top + 2, 3, 'lamp');
}

// Living room

// Upper cabinets over a counter with a sink and a stove; the wall shows between them.
function kitchen() {
  const draw = (busy) => {
    const canvas = blank(18, 24);
    canvas.drawMap(
      0,
      0,
      ['dddddddddddddddddd', 'ollllllllollllllll', 'oooooooooooooooooo', 'dddddddddddddddddd'],
      legend,
    );
    canvas.drawMap(11, 4, ['.gggggg', '..ssss.'], legend);
    canvas.drawMap(
      0,
      16,
      [
        'vvvvvvvvvvvvvvvvvv',
        'olllllllolllllllll',
        'oooooooooooooooooo',
        'oo.ooooooo.ooooooo',
        'oooooooooooooooooo',
        'oooooooooooooooooo',
        'oooooooooooooooooo',
        'dddddddddddddddddd',
      ],
      legend,
    );
    canvas.drawMap(2, 15, ['.g.'], legend);
    canvas.drawMap(11, 15, ['cc.cc'], legend);
    if (busy) canvas.drawMap(11, 14, ['rr..w', 'rr..w'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function fridge() {
  const canvas = blank(9, 20);
  canvas.fillRect(0, 0, 9, 20, 'white');
  canvas.strokeRect(0, 0, 9, 20, 'silver');
  canvas.hline(1, 7, 7, 'silver');
  canvas.vline(7, 2, 4, 'gray');
  canvas.vline(7, 9, 6, 'gray');
  canvas.vline(8, 1, 18, 'cloud');
  canvas.set(2, 3, 'cloth-red');
  canvas.set(3, 3, 'lamp');
  return idle(canvas);
}

function sofa() {
  const rows = [
    '..bbbbbbbbbbbbbbb..',
    '..bbbbbbbbbbbbbbb..',
    '..bbbbbbbbbbbbbbb..',
    'bbbbbbbbbbbbbbbbbbb',
    'bbnnnnnnnnnnnnnnnbb',
    'bbbbbbbbbbbbbbbbbbb',
    'nnnnnnnnnnnnnnnnnnn',
    '.d...............d.',
  ];
  const busy = map(rows);
  busy.drawMap(3, 1, ['rrr', 'rrr'], legend);
  return { idle: map(rows), busy };
}

function armchair() {
  return idle(
    map([
      '.rrrrrrr.',
      '.rrrrrrr.',
      '.rrrrrrr.',
      'rrrrrrrrr',
      'rrdddddrr',
      'rrrrrrrrr',
      'ddddddddd',
      '.d.....d.',
      '.d.....d.',
    ]),
  );
}

function coffeeTable() {
  const draw = (busy) => {
    const canvas = map([
      '..............',
      'llllllllllllll',
      'oooooooooooooo',
      '.d..........d.',
      '.d..........d.',
    ]);
    canvas.drawMap(3, 0, ['CC'], legend);
    if (busy) canvas.drawMap(9, 0, ['wr'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function tvStand() {
  const draw = (busy) => {
    const canvas = map([
      'cccccccccccc',
      'c..........c',
      'c..........c',
      'c..........c',
      'c..........c',
      'cccccccccccc',
      '.....cc.....',
      'llllllllllll',
      'oooooooooooo',
      'o.d......d.o',
      'o.d......d.o',
      'dddddddddddd',
    ]);
    canvas.fillRect(1, 1, 10, 4, busy ? 'sky' : 'slate');
    if (busy) {
      canvas.hline(2, 2, 4, 'sky-light');
      canvas.drawMap(7, 3, ['LL', 'LD'], legend);
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// A table for four seen from the side, with a chair at each end.
function diningTable() {
  const draw = (busy) => {
    const canvas = blank(24, 11);
    canvas.drawMap(
      0,
      2,
      ['o...', 'o...', 'o...', 'o...', 'oooo', 'o..o', 'o..o', 'd..d', 'd..d'],
      legend,
    );
    canvas.drawMap(
      20,
      2,
      ['...o', '...o', '...o', '...o', 'oooo', 'o..o', 'o..o', 'd..d', 'd..d'],
      legend,
    );
    canvas.hline(4, 4, 16, 'wood-light');
    canvas.hline(4, 5, 16, 'wood');
    canvas.vline(5, 6, 5, 'wood-dark');
    canvas.vline(18, 6, 5, 'wood-dark');
    canvas.drawMap(10, 1, ['.L.', 'LDL', 'CCC'], legend);
    if (busy) {
      canvas.drawMap(5, 3, ['www'], legend);
      canvas.drawMap(16, 3, ['www'], legend);
      canvas.set(6, 2, 'cloth-red');
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

export function floorLamp() {
  const draw = (lit) => {
    const canvas = blank(5, 13);
    lampShade(canvas, 0, 0, lit);
    canvas.vline(2, 3, 9, 'charcoal');
    canvas.hline(1, 12, 3, 'charcoal');
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

export function plantSmall() {
  return idle(map(['.L.L.', 'LDLLD', '.LDL.', '..D..', '.oCo.', '.ooo.']));
}

// Bedroom

const bedRows = [
  '.......................oo',
  '.......................ol',
  '.......................ol',
  'wwwwwwwwwwwwwwwwwwwwwwwol',
  'CCCCCCCCCCCCCCCCCCCCCCCol',
  'llllllllllllllllllllllllo',
  'oooooooooooooooooooooooo',
  'd.d..................d.d',
];

function bed() {
  const made = map(bedRows);
  made.drawMap(18, 2, ['CCCC'], legend);
  const used = map(bedRows);
  used.drawMap(1, 3, ['rrrrrrrrrrrrrrr', 'rrrrrrrrrrrrrrrr'], legend);
  used.drawMap(18, 2, ['wwww'], legend);
  // Slept in: the blanket pulled up to the pillow. People are never drawn into props.
  const asleep = used.clone();
  asleep.drawMap(1, 2, ['rrrrrrrrrrrrrrrrr'], legend);
  return { idle: made, busy: used, sleep: asleep };
}

function nightstand() {
  const draw = (lit) => {
    const canvas = blank(6, 12);
    lampShade(canvas, 0, 0, lit);
    canvas.drawMap(1, 3, ['.c..', 'ccc.'], legend);
    canvas.drawMap(0, 6, ['llllll', 'oooooo', 'od..do', 'oooooo', 'oooooo', 'd....d'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

export function wardrobe() {
  const canvas = blank(14, 21);
  canvas.fillRect(0, 0, 14, 21, 'wood');
  canvas.hline(0, 0, 14, 'wood-light');
  canvas.strokeRect(0, 1, 14, 19, 'wood-dark');
  canvas.vline(7, 1, 19, 'wood-dark');
  canvas.vline(5, 8, 3, 'wood-light');
  canvas.vline(9, 8, 3, 'wood-light');
  canvas.hline(0, 20, 14, 'charcoal');
  canvas.set(1, 20, 'wood-dark');
  canvas.set(12, 20, 'wood-dark');
  return idle(canvas);
}

export function dresser() {
  return idle(
    map([
      '.bb.......L.L.',
      '.bbr.......D..',
      '.bbrC.....ooo.',
      'llllllllllllll',
      'oooooooooooood',
      'od....kk....dd',
      'oooooooooooood',
      'od....kk....dd',
      'oddddddddddddd',
      'c............c',
    ]),
  );
}

export function mirror() {
  const canvas = blank(6, 10);
  canvas.strokeRect(0, 0, 6, 10, 'wood');
  canvas.fillRect(1, 1, 4, 8, 'sky-light');
  canvas.vline(2, 2, 3, 'white');
  canvas.set(3, 2, 'white');
  return idle(canvas);
}

export function condoProps() {
  return {
    kitchen: kitchen(),
    fridge: fridge(),
    sofa: sofa(),
    armchair: armchair(),
    'coffee-table': coffeeTable(),
    'tv-stand': tvStand(),
    'dining-table': diningTable(),
    bookshelf: idle(bookshelf()),
    'floor-lamp': floorLamp(),
    'plant-small': plantSmall(),
    'plant-medium': idle(plantMedium()),
    'plant-tall': idle(plantTall()),
    bed: bed(),
    nightstand: nightstand(),
    wardrobe: wardrobe(),
    dresser: dresser(),
    mirror: mirror(),
    clock: idle(clock()),
    'picture-small': idle(pictureSmall()),
    'picture-wide': idle(pictureWide()),
    'wall-shelf': idle(wallShelf()),
  };
}

export const condoGroup = {
  name: 'condo',
  draw() {
    return propSprites('condo', condoProps());
  },
};
