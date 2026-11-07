import { FLOOR_ROW, drawDoor, drawWindow, nightVersion, roomShell } from './shell.mjs';

export const HOTEL_STATES = ['empty', 'occupied', 'dirty', 'infested'];
const TIMES = ['day', 'night'];
const WAINSCOT_TOP = 18;
const PARTITION_LEFT = 47;
const DOOR = { left: 3, top: 10, width: 6, height: FLOOR_ROW - 12 };

const look = {
  wall: 'cloud',
  wallLight: 'white',
  wallDark: 'silver',
  floor: ['cloth-red', 'cloth-red', 'wood-dark'],
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
  L: 'leaf',
  D: 'leaf-dark',
  n: 'night',
};

const nightstand = ['llllll', 'oooooo', 'od..do', 'oooooo', 'oooooo', 'd....d'];
const plant = ['.L.L.', 'LDLLD', '.LDL.', '..D..', '.oCo.', '.ooo.'];
const suitcase = ['..ss..', 'gggggg', 'gvvvvg', 'gvggvg', 'gvvvvg', 'gggggg', 'k....k'];
const towel = ['wwwC', 'CwwwC'];
const armchair = [
  'bb......',
  'bb......',
  'bb......',
  'bb......',
  'bbbbbbbb',
  'bnnnnnnb',
  'oooooooo',
  'd......d',
];
const coffeeTable = ['llllllll', 'oooooooo', '.d....d.', '.d....d.'];
const tvCabinet = [
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
];
const serviceTray = ['.vvv.', 'wwrww', 'vvvvv'];

function lampShade(room, left, top, lit) {
  room.drawMap(left, top, ['.ooo.', 'ooooo', 'ooooo'], { o: lit ? 'lamp-glow' : 'concrete-light' });
  room.hline(left + 1, top + 2, 3, lit ? 'lamp' : 'concrete');
}

function drawWainscot(room) {
  room.fillRect(1, WAINSCOT_TOP, room.width - 2, FLOOR_ROW - 2 - WAINSCOT_TOP, 'concrete-light');
  room.hline(1, WAINSCOT_TOP, room.width - 2, 'wood');
  for (let x = 6; x < room.width - 2; x += 8) {
    room.vline(x, WAINSCOT_TOP + 2, FLOOR_ROW - 5 - WAINSCOT_TOP, 'concrete');
  }
}

function drawHotelDoor(room, occupied) {
  drawDoor(room, DOOR, { open: false, sign: false });
  room.hline(DOOR.left + 2, DOOR.top - 4, 2, 'lamp');
  if (occupied) {
    const tagLeft = DOOR.left + DOOR.width - 3;
    const tagTop = DOOR.top + Math.floor(DOOR.height / 2) + 1;
    room.fillRect(tagLeft, tagTop, 2, 3, 'cloth-red');
  }
}

// A bed seen from the side with the headboard on the right. A made bed has a white
// fold over a blue spread; a used one has the spread pulled back and creased sheets.
function drawBed(room, left, width, { made, pillows }) {
  const top = FLOOR_ROW - 7;
  const right = left + width - 1;
  room.fillRect(right - 1, top, 2, 6, 'wood');
  room.vline(right, top + 1, 5, 'wood-light');
  for (let pillow = 0; pillow < pillows; pillow++) {
    const pillowLeft = right - 6 - pillow * 5;
    room.hline(pillowLeft, top + 2, 4, made ? 'white' : 'cloud');
  }
  room.hline(left, top + 3, width - 2, 'white');
  room.hline(left, top + 4, width - 2, 'cloth-blue');
  room.hline(left, top + 5, width - 1, 'wood-light');
  room.hline(left, top + 6, width - 1, 'wood');
  room.set(left + 1, top + 7, 'wood-dark');
  room.set(right - 2, top + 7, 'wood-dark');
  if (!made) {
    rumpleSheets(room, left, top, width);
  }
}

function rumpleSheets(room, left, top, width) {
  for (let x = left; x < left + width - 2; x++) {
    if (x % 3 === 0) {
      room.set(x, top + 2, 'white');
      room.set(x, top + 3, 'cloud');
    }
    if (x % 4 === 1) {
      room.set(x, top + 4, 'white');
    }
  }
  room.fillRect(left, top + 4, 3, 2, 'cloth-blue');
  room.set(left - 1, top + 5, 'cloth-blue');
  room.set(left - 1, top + 6, 'cloth-blue');
}

function drawGrime(room, spots) {
  spots.forEach(([x, y], index) => {
    room.set(x, y, index % 2 === 0 ? 'leaf-dark' : 'concrete-dark');
  });
}

function drawRoaches(room, roaches) {
  for (const [x, y] of roaches) {
    room.hline(x, y, 2, 'wood-dark');
  }
}

function roomSprites(subject, { widthTiles, windows, drawFurniture, grime, roaches }) {
  const sprites = [];
  for (const state of HOTEL_STATES) {
    const room = roomShell(widthTiles, look);
    drawWainscot(room);
    windows.forEach((window) => drawWindow(room, window));
    drawHotelDoor(room, state === 'occupied');
    drawFurniture(room, state);
    if (state === 'dirty' || state === 'infested') {
      drawGrime(room, grime);
    }
    if (state === 'infested') {
      drawRoaches(room, roaches);
    }
    for (const time of TIMES) {
      const lit = state === 'occupied';
      const canvas = time === 'day' ? room : nightVersion(room, windows, lit);
      sprites.push({ id: `units/${subject}/${state}_${time}`, canvas });
    }
  }
  return sprites;
}

function drawSingleFurniture(room, state) {
  const used = state !== 'empty';
  drawBed(room, 13, 15, { made: state === 'empty' || state === 'occupied', pillows: 1 });
  room.drawMap(27, 12, ['.c', 'cc'], legend);
  lampShade(room, 25, 9, state === 'occupied');
  if (state === 'occupied') {
    room.drawMap(12, FLOOR_ROW - suitcase.length + 1, suitcase, legend);
  }
  if (used && state !== 'occupied') {
    room.drawMap(18, FLOOR_ROW - 1, towel, legend);
  }
}

function drawDoubleFurniture(room, state) {
  const made = state === 'empty' || state === 'occupied';
  drawBed(room, 13, 22, { made, pillows: 2 });
  const standLeft = 36;
  room.drawMap(standLeft, FLOOR_ROW - nightstand.length + 1, nightstand, legend);
  room.drawMap(standLeft + 1, FLOOR_ROW - nightstand.length - 3, ['.c..', 'ccc.'], legend);
  lampShade(room, standLeft, FLOOR_ROW - nightstand.length - 6, state === 'occupied');
  room.drawMap(42, FLOOR_ROW - plant.length + 1, plant, legend);
  if (state === 'occupied') {
    room.drawMap(10, FLOOR_ROW - suitcase.length + 1, suitcase, legend);
    room.drawMap(37, FLOOR_ROW - nightstand.length, ['bw'], legend);
  }
  if (!made) {
    room.drawMap(20, FLOOR_ROW - 1, towel, legend);
    room.drawMap(42, FLOOR_ROW - 1, ['ww'], legend);
  }
}

function drawSuiteFurniture(room, state) {
  const made = state === 'empty' || state === 'occupied';
  const occupied = state === 'occupied';

  room.drawMap(11, FLOOR_ROW - armchair.length + 1, armchair, legend);
  room.drawMap(20, FLOOR_ROW - coffeeTable.length + 1, coffeeTable, legend);
  const tvLeft = 31;
  room.drawMap(tvLeft, FLOOR_ROW - tvCabinet.length + 1, tvCabinet, legend);
  const screenTop = FLOOR_ROW - tvCabinet.length + 2;
  room.fillRect(tvLeft + 1, screenTop, 8, 3, occupied ? 'sky' : 'slate');
  if (occupied) {
    room.hline(tvLeft + 2, screenTop + 1, 3, 'sky-light');
    room.drawMap(21, FLOOR_ROW - coffeeTable.length, ['.rw'], legend);
  }
  if (!made) {
    room.drawMap(22, FLOOR_ROW - coffeeTable.length - 3, serviceTray, legend);
  }
  room.drawMap(42, FLOOR_ROW - plant.length + 1, plant, legend);

  room.fillRect(PARTITION_LEFT, 1, 3, FLOOR_ROW - 3, 'concrete-light');
  room.vline(PARTITION_LEFT, 1, FLOOR_ROW - 3, 'white');
  room.vline(PARTITION_LEFT + 2, 1, FLOOR_ROW - 3, 'concrete');

  drawBed(room, 51, 21, { made, pillows: 2 });
  const standLeft = 72;
  room.drawMap(standLeft, FLOOR_ROW - nightstand.length + 1, nightstand, legend);
  room.drawMap(standLeft + 1, FLOOR_ROW - nightstand.length - 3, ['.c..', 'ccc.'], legend);
  lampShade(room, standLeft, FLOOR_ROW - nightstand.length - 6, occupied);
  if (occupied) {
    room.drawMap(50, FLOOR_ROW - suitcase.length + 1, suitcase, legend);
  }
  if (!made) {
    room.drawMap(56, FLOOR_ROW - 1, towel, legend);
    room.drawMap(13, FLOOR_ROW - armchair.length + 4, ['ww', 'Cw'], legend);
  }
}

export function singleRoomSprites() {
  return roomSprites('single-room', {
    widthTiles: 4,
    windows: [{ left: 15, top: 4, width: 9, height: 7 }],
    drawFurniture: drawSingleFurniture,
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
  });
}

export function doubleRoomSprites() {
  return roomSprites('double-room', {
    widthTiles: 6,
    windows: [{ left: 17, top: 4, width: 14, height: 7 }],
    drawFurniture: drawDoubleFurniture,
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
  });
}

export function suiteSprites() {
  return roomSprites('suite', {
    widthTiles: 10,
    windows: [
      { left: 15, top: 4, width: 14, height: 7 },
      { left: 55, top: 4, width: 14, height: 7 },
    ],
    drawFurniture: drawSuiteFurniture,
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
  });
}
