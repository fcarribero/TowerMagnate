import { FLOOR_ROW, drawWindow, rentalSprites, roomShell } from './shell.mjs';

const WIDTH_TILES = 16;
const WINDOWS = [
  { left: 35, top: 4, width: 14, height: 8 },
  { left: 93, top: 4, width: 14, height: 8 },
];
const PARTITION_LEFT = 84;

const look = {
  wall: 'concrete-light',
  wallLight: 'cloud',
  wallDark: 'concrete',
  floor: ['wood-light', 'wood', 'wood-dark'],
};

const legend = {
  k: 'ink',
  c: 'charcoal',
  s: 'slate',
  g: 'gray',
  v: 'silver',
  C: 'cloud',
  w: 'white',
  d: 'wood-dark',
  o: 'wood',
  l: 'wood-light',
  b: 'cloth-blue',
  r: 'cloth-red',
  y: 'lamp',
  Y: 'lamp-glow',
  L: 'leaf',
  D: 'leaf-dark',
  n: 'night',
};

const kitchen = {
  upper: ['dddddddddddddddddd', 'ollllllllollllllll', 'oooooooooooooooooo', 'dddddddddddddddddd'],
  lower: [
    'vvvvvvvvvvvvvvvvvv',
    'olllllllolllllllll',
    'oooooooooooooooooo',
    'oo.ooooooo.ooooooo',
    'oooooooooooooooooo',
    'oooooooooooooooooo',
    'oooooooooooooooooo',
    'dddddddddddddddddd',
  ],
};

const sofa = [
  '..bbbbbbbbbbbbbbb..',
  '..bbbbbbbbbbbbbbb..',
  '..bbbbbbbbbbbbbbb..',
  'bbbbbbbbbbbbbbbbbbb',
  'bbnnnnnnnnnnnnnnnbb',
  'bbbbbbbbbbbbbbbbbbb',
  'nnnnnnnnnnnnnnnnnnn',
  '.d...............d.',
];

const tv = [
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
];

const floorLamp = [
  '.....',
  '.....',
  '.....',
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '.ccc.',
];

const nightstand = ['llllll', 'oooooo', 'od..do', 'oooooo', 'oooooo', 'd....d'];

const bed = [
  '.......................oo',
  '.......................ol',
  '.......................ol',
  'wwwwwwwwwwwwwwwwwwwwwwwol',
  'CCCCCCCCCCCCCCCCCCCCCCCol',
  'llllllllllllllllllllllllo',
  'oooooooooooooooooooooooo',
  'd.d..................d.d',
];

const plant = ['.L.L.', 'LDLLD', '.LDL.', '..D..', '.oCo.', '.ooo.'];

function drawLampShade(room, left, top, lit) {
  room.drawMap(left, top, ['.ooo.', 'ooooo', 'ooooo'], { o: lit ? 'lamp-glow' : 'cloud' });
  if (lit) {
    room.hline(left + 1, top + 2, 3, 'lamp');
  }
}

function drawLivingRoom(room, occupied) {
  room.drawMap(13, 3, kitchen.upper, legend);
  room.drawMap(13, FLOOR_ROW - kitchen.lower.length + 1, kitchen.lower, legend);
  if (occupied) {
    room.drawMap(16, FLOOR_ROW - kitchen.lower.length, ['rr..ww'], legend);
  }

  room.drawMap(37, FLOOR_ROW - sofa.length + 1, sofa, legend);
  if (occupied) {
    room.drawMap(40, FLOOR_ROW - sofa.length + 2, ['rrr', 'rrr'], legend);
  }

  const lampLeft = 58;
  room.drawMap(lampLeft, FLOOR_ROW - floorLamp.length + 1, floorLamp, legend);
  drawLampShade(room, lampLeft, FLOOR_ROW - floorLamp.length - 1, occupied);

  const tvLeft = 67;
  room.drawMap(tvLeft, FLOOR_ROW - tv.length + 1, tv, legend);
  const screenTop = FLOOR_ROW - tv.length + 2;
  room.fillRect(tvLeft + 1, screenTop, 10, 4, occupied ? 'sky' : 'slate');
  if (occupied) {
    room.hline(tvLeft + 2, screenTop + 1, 4, 'sky-light');
    room.drawMap(tvLeft + 6, screenTop + 2, ['LL', 'LD'], legend);
  }

  room.drawMap(32, FLOOR_ROW - plant.length + 1, plant, legend);
}

function drawPartition(room) {
  room.fillRect(PARTITION_LEFT, 1, 3, FLOOR_ROW - 3, 'concrete');
  room.vline(PARTITION_LEFT, 1, FLOOR_ROW - 3, 'cloud');
  room.vline(PARTITION_LEFT + 2, 1, FLOOR_ROW - 3, 'concrete-dark');
}

function drawBedroom(room, occupied) {
  const standLeft = 90;
  room.drawMap(standLeft, FLOOR_ROW - nightstand.length + 1, nightstand, legend);
  room.drawMap(standLeft + 1, FLOOR_ROW - nightstand.length - 3, ['.c..', 'ccc.'], legend);
  drawLampShade(room, standLeft, FLOOR_ROW - nightstand.length - 6, occupied);

  const bedLeft = 100;
  const bedTop = FLOOR_ROW - bed.length + 1;
  room.drawMap(bedLeft, bedTop, bed, legend);
  if (occupied) {
    room.drawMap(bedLeft + 1, bedTop + 3, ['rrrrrrrrrrrrrrr', 'rrrrrrrrrrrrrrrr'], legend);
    room.drawMap(bedLeft + 18, bedTop + 2, ['wwww'], legend);
  } else {
    room.drawMap(bedLeft + 18, bedTop + 2, ['CCCC'], legend);
  }
}

function drawCondo(state) {
  const occupied = state === 'occupied';
  const room = roomShell(WIDTH_TILES, look);
  WINDOWS.forEach((window) => drawWindow(room, window));
  drawPartition(room);
  // A vacant condo is a bare room; the furniture arrives with the owner. A closed
  // one has it with the lamps and the TV off; an occupied one is in use.
  if (state !== 'empty') {
    drawLivingRoom(room, occupied);
    drawBedroom(room, occupied);
  }
  return room;
}

export function condoSprites() {
  return rentalSprites('condo', { windows: WINDOWS, drawDay: drawCondo });
}
