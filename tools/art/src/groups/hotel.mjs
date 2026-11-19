import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { dresser, floorLamp, mirror, plantSmall } from './condo.mjs';
import {
  clock,
  legend as officeLegend,
  pictureSmall,
  pictureWide,
  plantMedium,
  propSprites,
} from './office.mjs';

// Hotel room props, shared by the single room, the double room and the suite, placed by the
// client on top of the bare room (units/<room>/empty_day). Looks: `idle` is the clean room
// waiting for a guest, lights off; `busy` is a guest awake inside (lamps lit, TV on); `sleep`
// has the guest in bed; `dirty` is the room after checkout (bed unmade, tray left out).
// Overlays `hotel/overlay/<room>-grime` and `-roaches` go over a dirty and an infested room.
// The sizes here must match the specs in apps/web/src/render/interior/hotel.ts.

const legend = { ...officeLegend, n: 'night', p: 'skin-mid' };
const FLOOR_ROW = metrics.floorHeight - metrics.slabHeight - 1;

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

// A lamp shade, lit or not, in the hotel's warm colors.
function lampShade(canvas, left, top, lit) {
  canvas.drawMap(left, top, ['.ooo.', 'ooooo', 'ooooo'], {
    o: lit ? 'lamp-glow' : 'concrete-light',
  });
  canvas.hline(left + 1, top + 2, 3, lit ? 'lamp' : 'concrete');
}

// A bed seen from the side with the headboard on the right, `width` wide and 8 tall. A made
// bed has a white fold over a blue spread; a used one has the spread pulled back.
function drawBed(width, pillows, { made, sleeper }) {
  const canvas = blank(width, 8);
  const right = width - 1;
  canvas.fillRect(right - 1, 0, 2, 6, 'wood');
  canvas.vline(right, 1, 5, 'wood-light');
  for (let pillow = 0; pillow < pillows; pillow++) {
    canvas.hline(right - 6 - pillow * 5, 2, 4, made ? 'white' : 'cloud');
  }
  canvas.hline(0, 3, width - 2, 'white');
  canvas.hline(0, 4, width - 2, 'cloth-blue');
  canvas.hline(0, 5, width - 1, 'wood-light');
  canvas.hline(0, 6, width - 1, 'wood');
  canvas.set(1, 7, 'wood-dark');
  canvas.set(right - 2, 7, 'wood-dark');
  if (!made) {
    for (let x = 0; x < width - 2; x++) {
      if (x % 3 === 0) {
        canvas.set(x, 2, 'white');
        canvas.set(x, 3, 'cloud');
      }
      if (x % 4 === 1) canvas.set(x, 4, 'white');
    }
    canvas.fillRect(0, 4, 3, 2, 'cloth-blue');
  }
  if (sleeper) {
    canvas.fillRect(right - 6, 0, 4, 3, 'skin-mid');
    canvas.hline(right - 6, 0, 4, 'wood-dark');
    canvas.hline(2, 2, width - 10, 'cloth-blue');
    canvas.hline(3, 1, width - 12, 'cloth-blue');
  }
  return canvas;
}

function bed(width, pillows) {
  return {
    idle: drawBed(width, pillows, { made: true, sleeper: false }),
    sleep: drawBed(width, pillows, { made: true, sleeper: true }),
    dirty: drawBed(width, pillows, { made: false, sleeper: false }),
  };
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

// A reading lamp on an arm fixed to the wall.
function wallLamp() {
  const draw = (lit) => {
    const canvas = blank(5, 5);
    lampShade(canvas, 0, 0, lit);
    canvas.drawMap(2, 3, ['.c', 'cc'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function suitcase() {
  return idle(map(['..ss..', 'gggggg', 'gvvvvg', 'gvggvg', 'gvvvvg', 'gggggg', 'k....k']));
}

function towels() {
  return idle(map(['wwwC.', 'CwwwC']));
}

function armchair() {
  const draw = (dirty) => {
    const canvas = map([
      'bb......',
      'bb......',
      'bb......',
      'bb......',
      'bbbbbbbb',
      'bnnnnnnb',
      'oooooooo',
      'd......d',
    ]);
    if (dirty) canvas.drawMap(2, 3, ['ww', 'Cw'], legend);
    return canvas;
  };
  return { idle: draw(false), dirty: draw(true) };
}

function coffeeTable() {
  const draw = (look) => {
    const canvas = blank(8, 7);
    canvas.drawMap(0, 3, ['llllllll', 'oooooooo', '.d....d.', '.d....d.'], legend);
    if (look === 'busy') canvas.drawMap(1, 2, ['.rw'], legend);
    if (look === 'dirty') canvas.drawMap(2, 0, ['.vvv.', 'wwrww', 'vvvvv'], legend);
    return canvas;
  };
  return { idle: draw('idle'), busy: draw('busy'), dirty: draw('dirty') };
}

function tvCabinet() {
  const draw = (on) => {
    const canvas = map([
      'cccccccccc',
      'c........c',
      'c........c',
      'c........c',
      'cccccccccc',
      '....cc....',
      'llllllllll',
      'oooooooooo',
      'o.d....d.o',
      'o.d....d.o',
      'dddddddddd',
    ]);
    canvas.fillRect(1, 1, 8, 3, on ? 'sky' : 'slate');
    if (on) canvas.hline(2, 2, 3, 'sky-light');
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// A desk with a chair tucked in front, for a guest who works.
function writingDesk() {
  const draw = (busy) => {
    const canvas = map([
      '..............',
      '..............',
      '..............',
      'llllllllllllll',
      'oooooooooooooo',
      'd.....ssss...d',
      'd....sggggs..d',
      'd....sggggs..d',
      'd.....ssss...d',
      'd......cc....d',
      'd.....c..c...d',
    ]);
    canvas.drawMap(10, 1, ['.y.', 'ccc'], legend);
    if (busy) {
      canvas.drawMap(2, 1, ['cccc.', 'ccccc'], legend);
      canvas.hline(3, 1, 2, 'sky-light');
    } else {
      canvas.drawMap(2, 2, ['CCw'], legend);
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// A folding rack for a suitcase.
function luggageRack() {
  return idle(map(['oooooooo', 'd.d..d.d', '.d....d.', '.d....d.', 'd.d..d.d']));
}

function minibar() {
  const canvas = map(['cccccc', 'cssssc', 'csgssc', 'cssssc', 'cccccc', 'c....c']);
  canvas.set(4, 2, 'lamp');
  return idle(canvas);
}

// The wall between the suite's sitting room and bedroom, from the ceiling to the floor.
function partition() {
  const canvas = blank(3, 26);
  canvas.fillRect(0, 0, 3, 26, 'concrete-light');
  canvas.vline(0, 0, 25, 'white');
  canvas.vline(2, 0, 25, 'concrete');
  return idle(canvas);
}

export function hotelProps() {
  return {
    'bed-single': bed(15, 1),
    'bed-double': bed(22, 2),
    nightstand: nightstand(),
    'wall-lamp': wallLamp(),
    suitcase: suitcase(),
    towels: towels(),
    armchair: armchair(),
    'coffee-table': coffeeTable(),
    'tv-cabinet': tvCabinet(),
    'writing-desk': writingDesk(),
    'luggage-rack': luggageRack(),
    minibar: minibar(),
    partition: partition(),
    'plant-small': plantSmall(),
    'plant-medium': idle(plantMedium()),
    'floor-lamp': floorLamp(),
    dresser: dresser(),
    mirror: mirror(),
    clock: idle(clock()),
    'picture-small': idle(pictureSmall()),
    'picture-wide': idle(pictureWide()),
  };
}

// Grime and roaches over a whole room, at the spots the fixed sprites had them.
const ROOMS = {
  'single-room': {
    width: 32,
    grime: [
      [11, 27],
      [14, 26],
      [25, 27],
      [29, 26],
      [12, 24],
      [29, 23],
    ],
    roaches: [
      [12, 6],
      [20, 14],
      [27, 3],
      [16, 20],
      [24, 26],
      [10, 27],
      [22, 22],
      [28, 17],
    ],
  },
  'double-room': {
    width: 48,
    grime: [
      [11, 27],
      [15, 26],
      [26, 27],
      [33, 26],
      [40, 27],
      [45, 26],
      [12, 24],
      [44, 23],
    ],
    roaches: [
      [12, 6],
      [36, 4],
      [41, 13],
      [22, 15],
      [16, 23],
      [30, 26],
      [44, 27],
      [27, 20],
    ],
  },
  suite: {
    width: 80,
    grime: [
      [11, 27],
      [19, 26],
      [29, 27],
      [43, 26],
      [53, 27],
      [66, 26],
      [75, 27],
      [44, 23],
    ],
    roaches: [
      [12, 6],
      [33, 3],
      [38, 13],
      [43, 15],
      [52, 14],
      [61, 22],
      [70, 26],
      [25, 26],
    ],
  },
};

function overlays() {
  return Object.entries(ROOMS).flatMap(([room, { width, grime, roaches }]) => {
    const dirt = blank(width, FLOOR_ROW + 1);
    grime.forEach(([x, y], index) =>
      dirt.set(x, y, index % 2 === 0 ? 'leaf-dark' : 'concrete-dark'),
    );
    const bugs = blank(width, FLOOR_ROW + 1);
    roaches.forEach(([x, y]) => bugs.hline(x, y, 2, 'wood-dark'));
    return [
      { id: `hotel/overlay/${room}-grime`, canvas: dirt },
      { id: `hotel/overlay/${room}-roaches`, canvas: bugs },
    ];
  });
}

export const hotelGroup = {
  name: 'hotel',
  draw() {
    return propSprites(
      'hotel',
      hotelProps(),
      [
        [9, 7],
        [14, 7],
      ],
      overlays(),
    );
  },
};
