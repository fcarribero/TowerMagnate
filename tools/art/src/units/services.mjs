import { toBurnt } from '../burnt.mjs';
import { metrics } from '../metrics.mjs';
import { FLOOR_ROW, drawDoor, drawWindow, nightVersion, roomShell } from './shell.mjs';

const { floorHeight, slabHeight } = metrics;
const STATES = ['empty', 'occupied'];

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
  r: 'cloth-red',
  b: 'cloth-blue',
  y: 'lamp',
  Y: 'lamp-glow',
  L: 'leaf',
  G: 'glass',
  1: 'skin-light',
  2: 'skin-mid',
  3: 'skin-dark',
};

function floorRowOf(level) {
  return level * floorHeight + FLOOR_ROW;
}

function standOnFloor(room, left, map, level = 0) {
  room.drawMap(left, floorRowOf(level) - map.length + 1, map, legend);
}

// Every service unit has an empty and an occupied sprite for day and night, and
// one burnt sprite that is the same at any hour.
function serviceSprites(subject, { windows = [], drawDay }) {
  const sprites = [];
  for (const state of STATES) {
    const occupied = state === 'occupied';
    const day = drawDay(occupied);
    sprites.push({ id: `units/${subject}/${state}_day`, canvas: day });
    sprites.push({
      id: `units/${subject}/${state}_night`,
      canvas: nightVersion(day, windows, occupied),
    });
  }
  sprites.push({
    id: `units/${subject}/burnt`,
    canvas: toBurnt(drawDay(false), { windows }),
  });
  return sprites;
}

function guard(skin) {
  return [
    '.kkk.',
    `.${skin}${skin}${skin}.`,
    `.${skin}${skin}${skin}.`,
    '.bbb.',
    'bbybb',
    `${skin}bbb${skin}`,
    '.bbb.',
    '.kkk.',
    '.bbb.',
    '.bbb.',
    '.k.k.',
    '.k.k.',
  ];
}

function nurse(skin) {
  return [
    '.ddd.',
    `.${skin}${skin}${skin}.`,
    `.${skin}${skin}${skin}.`,
    '.CCC.',
    'CCrCC',
    `${skin}CCC${skin}`,
    '.CCC.',
    '.CCC.',
    '.CCC.',
    '.CCC.',
    '.k.k.',
    '.k.k.',
  ];
}

function worker(skin) {
  return [
    '.yyy.',
    `.${skin}${skin}${skin}.`,
    `.${skin}${skin}${skin}.`,
    '.LLL.',
    'LLLLL',
    `${skin}LLL${skin}`,
    '.LLL.',
    '.bbb.',
    '.bbb.',
    '.bbb.',
    '.k.k.',
    '.k.k.',
  ];
}

const carMap = [
  '.....kkkkkkkkkk.....',
  '....kGGGkGGGGGGk....',
  '...kGGGGkGGGGGGGk...',
  '.kkBBBBBBBBBBBBBBkk.',
  'kBBBBBBBBBBBBBBBBBBk',
  'kBBBBBBBBBBBBBBBBBBk',
  'kkkkkkkkkkkkkkkkkkkk',
  '..kkkk........kkkk..',
  '..kkkk........kkkk..',
];
const CAR_HEIGHT = carMap.length;

function drawCar(room, left, top, bodyColor) {
  room.drawMap(left, top, carMap, { ...legend, B: bodyColor });
  room.set(left + 18, top + 4, 'lamp-glow');
  room.set(left + 1, top + 4, 'cloth-red');
}

function parkingSign(room, left, top) {
  room.fillRect(left, top, 9, 9, 'cloth-blue');
  room.strokeRect(left, top, 9, 9, 'white');
  room.vline(left + 3, top + 2, 5, 'white');
  room.hline(left + 3, top + 2, 3, 'white');
  room.hline(left + 3, top + 4, 3, 'white');
  room.set(left + 5, top + 3, 'white');
}

function ceilingLamp(room, left) {
  room.hline(left, 2, 5, 'slate');
  room.hline(left + 1, 3, 3, 'lamp');
}

const SECURITY_WINDOWS = [{ left: 6, top: 4, width: 12, height: 7 }];
const SECURITY_DOOR = { left: 117, top: 10, width: 6, height: FLOOR_ROW - 12 };
const securityLook = {
  wall: 'concrete-light',
  wallLight: 'cloud',
  wallDark: 'concrete',
  floor: ['gray', 'slate', 'charcoal'],
};

const shield = [
  'kkkkkkkkk',
  'kbbbkbbbk',
  'kbbbkbbbk',
  'kbbyyybbk',
  'kbbbybbbk',
  '.kbbybbk.',
  '..kbbbk..',
  '...kbk...',
];

function drawMonitorWall(room, occupied) {
  const screenColors = ['leaf', 'lamp-glow', 'glass'];
  room.fillRect(36, 4, 52, 14, 'slate');
  room.strokeRect(36, 4, 52, 14, 'ink');
  screenColors.forEach((color, index) => {
    const left = 39 + index * 16;
    room.fillRect(left, 7, 14, 8, 'ink');
    room.fillRect(left + 1, 8, 12, 6, occupied ? color : 'charcoal');
    if (occupied) {
      room.hline(left + 2, 10, 5, 'white');
      room.hline(left + 5, 12, 6, 'white');
    }
  });
}

function drawLocker(room, left) {
  room.fillRect(left, 8, 7, 20, 'slate');
  room.strokeRect(left, 8, 7, 20, 'ink');
  room.vline(left + 1, 9, 18, 'gray');
  room.hline(left + 2, 10, 3, 'charcoal');
  room.set(left + 5, 17, 'lamp');
}

function drawSecurity(occupied) {
  const room = roomShell(16, securityLook);
  SECURITY_WINDOWS.forEach((window) => drawWindow(room, window));
  drawDoor(room, SECURITY_DOOR, { open: occupied, sign: false });
  room.drawMap(22, 5, shield, legend);
  drawMonitorWall(room, occupied);

  room.fillRect(34, 20, 56, 2, 'wood-light');
  room.fillRect(34, 22, 56, 4, 'wood');
  room.vline(35, 22, 6, 'wood-dark');
  room.vline(88, 22, 6, 'wood-dark');
  room.hline(42, 19, 6, 'silver');
  room.hline(70, 19, 4, 'cloud');

  [92, 100, 108].forEach((left) => drawLocker(room, left));
  if (occupied) {
    standOnFloor(room, 46, guard('1'));
    standOnFloor(room, 64, guard('2'));
  }
  return room;
}

const MEDICAL_WINDOWS = [
  { left: 10, top: 4, width: 14, height: 8 },
  { left: 56, top: 4, width: 14, height: 8 },
  { left: 150, top: 4, width: 14, height: 8 },
];
const MEDICAL_DOOR = { left: 196, top: 10, width: 6, height: FLOOR_ROW - 12 };
const medicalLook = {
  wall: 'white',
  wallLight: 'white',
  wallDark: 'cloud',
  floor: ['cloud', 'silver', 'gray'],
};

function drawRedCross(room, left, top) {
  room.fillRect(left, top, 12, 12, 'white');
  room.strokeRect(left, top, 12, 12, 'silver');
  room.fillRect(left + 5, top + 2, 2, 8, 'cloth-red');
  room.fillRect(left + 2, top + 5, 8, 2, 'cloth-red');
}

function drawBed(room, left, patientSkin) {
  const top = 16;
  room.fillRect(left, top + 4, 30, 2, 'silver');
  room.fillRect(left, top + 6, 30, 6, 'white');
  room.fillRect(left + 8, top + 6, 22, 6, 'cloth-blue');
  room.hline(left + 8, top + 11, 22, 'night');
  room.fillRect(left + 1, top + 4, 7, 2, 'cloud');
  room.vline(left, top, 14, 'silver');
  room.vline(left + 29, top + 2, 12, 'silver');
  room.vline(left + 1, top + 12, 2, 'gray');
  room.vline(left + 28, top + 12, 2, 'gray');
  if (patientSkin) {
    room.fillRect(left + 2, top + 1, 5, 4, patientSkin);
  }
}

function drawMedical(occupied) {
  const room = roomShell(26, medicalLook);
  MEDICAL_WINDOWS.forEach((window) => drawWindow(room, window));
  drawDoor(room, MEDICAL_DOOR, { open: occupied, sign: false });
  drawRedCross(room, 100, 5);

  drawBed(room, 14, occupied ? 'skin-light' : null);
  drawBed(room, 60, occupied ? 'skin-dark' : null);
  room.fillRect(46, 12, 5, 13, 'glass');
  room.hline(44, 12, 9, 'gray');

  room.fillRect(108, 14, 18, 14, 'cloud');
  room.strokeRect(108, 14, 18, 14, 'silver');
  room.hline(109, 21, 16, 'silver');
  room.set(116, 17, 'cloth-red');
  room.set(116, 24, 'cloth-red');

  room.fillRect(134, 14, 8, 14, 'silver');
  room.fillRect(135, 15, 6, 4, 'night');
  room.fillRect(168, 20, 20, 2, 'wood-light');
  room.fillRect(168, 22, 20, 6, 'wood');
  if (occupied) {
    standOnFloor(room, 92, nurse('2'));
    standOnFloor(room, 178, nurse('1'));
  }
  return room;
}

const garageLook = {
  wall: 'concrete-dark',
  wallLight: 'concrete',
  wallDark: 'charcoal',
  floor: ['concrete', 'concrete-dark', 'charcoal'],
};

const RAMP_LEFT = 4;
const RAMP_RIGHT = 118;
const RAMP_TOP_START = 8;
const RAMP_TOP_END = 22;
const RAMP_CAR_LEFT = 48;

function rampTop(x) {
  const progress = (x - RAMP_LEFT) / (RAMP_RIGHT - RAMP_LEFT);
  return Math.round(RAMP_TOP_START + progress * (RAMP_TOP_END - RAMP_TOP_START));
}

function drawRamp(room) {
  for (let x = RAMP_LEFT; x <= RAMP_RIGHT; x++) {
    const top = rampTop(x);
    room.vline(x, top, FLOOR_ROW - top + 1, 'concrete');
    room.set(x, top, 'concrete-light');
    room.set(x, top + 1, x % 8 < 4 ? 'lamp' : 'concrete');
    room.set(x, top + 2, 'concrete-dark');
  }
}

function drawBarrier(room, left) {
  room.fillRect(left, 14, 4, 14, 'gray');
  room.strokeRect(left, 14, 4, 14, 'ink');
  room.fillRect(left - 22, 16, 22, 3, 'white');
  for (let x = left - 22; x < left; x += 4) {
    room.fillRect(x, 16, 2, 3, 'cloth-red');
  }
  room.set(left + 1, 17, 'cloth-red');
}

function drawParkingRamp(occupied) {
  const room = roomShell(16, garageLook);
  parkingSign(room, 96, 5);
  [30, 70, 110].forEach((left) => ceilingLamp(room, left));
  drawRamp(room);
  drawBarrier(room, 120);
  if (occupied) {
    const surface = rampTop(RAMP_CAR_LEFT + 10);
    drawCar(room, RAMP_CAR_LEFT, surface - CAR_HEIGHT, 'cloth-red');
  }
  return room;
}

function drawParkingSpace(occupied) {
  const room = roomShell(4, garageLook);
  parkingSign(room, 4, 5);
  ceilingLamp(room, 14);
  room.vline(2, 22, 4, 'lamp');
  room.vline(29, 22, 4, 'lamp');
  room.fillRect(26, 14, 4, 12, 'gray');
  room.hline(26, 14, 4, 'silver');
  for (let y = 15; y < 26; y += 4) {
    room.hline(26, y, 4, 'lamp');
  }
  if (occupied) {
    drawCar(room, 4, FLOOR_ROW - CAR_HEIGHT + 1, 'cloth-blue');
  }
  return room;
}

// A parking space with no road link: the lamps are dead and a red cross covers the sign.
function drawDisconnectedParkingSpace() {
  const room = drawParkingSpace(false);
  room.fillRect(2, 22, 1, 4, 'slate');
  room.fillRect(29, 22, 1, 4, 'slate');
  for (let y = 15; y < 26; y += 4) {
    room.hline(26, y, 4, 'slate');
  }
  room.hline(14, 3, 3, 'slate');
  for (let i = 0; i < 9; i++) {
    room.set(4 + i, 5 + i, 'cloth-red');
    room.set(12 - i, 5 + i, 'cloth-red');
  }
  return room;
}

const RECYCLING_FLOORS = 2;
const RECYCLING_WINDOWS = [
  { left: 40, top: 4, width: 14, height: 8 },
  { left: 130, top: 4, width: 14, height: 8 },
];
const RECYCLING_DOOR = { left: 188, top: floorHeight + 10, width: 6, height: FLOOR_ROW - 12 };
const recyclingLook = {
  wall: 'concrete-light',
  wallLight: 'cloud',
  wallDark: 'concrete',
  floor: ['silver', 'gray', 'slate'],
};
const CONVEYOR = { left: 44, width: 116 };

function drawBin(room, left, top, color) {
  room.fillRect(left, top, 14, 14, color);
  room.hline(left, top, 14, 'white');
  room.fillRect(left + 1, top + 14, 12, 2, 'slate');
  room.strokeRect(left, top, 14, 14, 'ink');
  room.fillRect(left + 4, top + 4, 6, 6, 'white');
  room.fillRect(left + 5, top + 5, 4, 4, color);
}

function drawConveyor(room, top, loaded) {
  room.fillRect(CONVEYOR.left, top, CONVEYOR.width, 4, 'charcoal');
  room.hline(CONVEYOR.left, top, CONVEYOR.width, 'slate');
  for (let x = CONVEYOR.left + 2; x < CONVEYOR.left + CONVEYOR.width; x += 6) {
    room.set(x, top + 2, loaded ? 'gray' : 'slate');
  }
  for (let x = CONVEYOR.left + 8; x < CONVEYOR.left + CONVEYOR.width; x += 24) {
    room.vline(x, top + 4, FLOOR_ROW - top - 3, 'slate');
  }
  if (loaded) {
    const items = [
      { x: 48, color: 'cloth-blue' },
      { x: 62, color: 'leaf' },
      { x: 128, color: 'lamp' },
      { x: 144, color: 'wood-light' },
    ];
    items.forEach(({ x, color }) => {
      room.fillRect(x, top - 5, 6, 5, color);
      room.strokeRect(x, top - 5, 6, 5, 'ink');
    });
  }
}

function drawSorter(room, top, running) {
  const lampColor = (color) => (running ? color : 'charcoal');
  room.fillRect(80, top, 42, 28, 'gray');
  room.hline(80, top, 42, 'silver');
  room.vline(80, top, 28, 'silver');
  room.hline(80, top + 27, 42, 'slate');
  room.strokeRect(80, top, 42, 28, 'ink');
  room.fillRect(86, top + 4, 12, 8, 'ink');
  room.fillRect(87, top + 5, 10, 6, lampColor('lamp-glow'));
  room.set(106, top + 6, lampColor('leaf'));
  room.set(110, top + 6, lampColor('lamp'));
  room.set(114, top + 6, lampColor('cloth-red'));
  room.hline(86, top + 18, 30, 'slate');
  room.hline(86, top + 21, 30, 'slate');
}

function drawCompactor(room, top, running) {
  room.fillRect(166, top, 18, 24, 'silver');
  room.strokeRect(166, top, 18, 24, 'ink');
  room.fillRect(168, top + 2, 14, 8, 'slate');
  room.fillRect(173, top + 10, 4, running ? 4 : 8, 'gray');
  room.fillRect(168, top + 20, 14, 2, 'cloth-red');
}

function drawRecyclingSign(room, left, top) {
  room.fillRect(left, top, 14, 14, 'leaf-dark');
  room.strokeRect(left, top, 14, 14, 'leaf');
  room.hline(left + 4, top + 3, 6, 'white');
  room.set(left + 9, top + 4, 'white');
  room.set(left + 10, top + 5, 'white');
  room.vline(left + 3, top + 4, 5, 'white');
  room.set(left + 4, top + 9, 'white');
  room.hline(left + 5, top + 10, 5, 'white');
  room.set(left + 10, top + 9, 'white');
}

// The chute drops from the upper floor through the slab to the lower floor.
function drawChute(room) {
  const left = 8;
  room.fillRect(left, 6, 6, 52, 'gray');
  room.vline(left, 6, 52, 'silver');
  room.vline(left + 5, 6, 52, 'slate');
  room.strokeRect(left, 6, 6, 52, 'ink');
  room.fillRect(left - 3, 6, 12, 3, 'silver');
  room.strokeRect(left - 3, 6, 12, 3, 'ink');
}

function drawHopper(room) {
  room.fillRect(86, 20, 30, 8, 'gray');
  room.strokeRect(86, 20, 30, 8, 'ink');
  room.hline(87, 21, 28, 'silver');
  room.fillRect(99, 28, 4, 5, 'slate');
}

function drawRecycling(occupied) {
  const room = roomShell(25, recyclingLook, RECYCLING_FLOORS);
  RECYCLING_WINDOWS.forEach((window) => drawWindow(room, window));
  drawDoor(room, RECYCLING_DOOR, { open: occupied, sign: false });
  drawRecyclingSign(room, 150, 6);
  drawHopper(room);
  drawBin(room, 160, floorRowOf(0) - 15, 'leaf');
  drawBin(room, 176, floorRowOf(0) - 15, 'cloth-blue');

  const lowerFloor = floorRowOf(1);
  drawConveyor(room, lowerFloor - 12, occupied);
  drawSorter(room, lowerFloor - 28, occupied);
  drawCompactor(room, lowerFloor - 24, occupied);
  drawBin(room, 24, lowerFloor - 15, 'cloth-blue');
  drawChute(room);
  if (occupied) {
    standOnFloor(room, 130, worker('2'), 1);
    standOnFloor(room, 130, worker('1'), 0);
  }
  return room;
}

const SUBWAY_FLOORS = 3;
const PLATFORM_LEVEL = SUBWAY_FLOORS - 1;
const SUBWAY_WINDOWS = [
  { left: 20, top: 4, width: 16, height: 7 },
  { left: 100, top: 4, width: 16, height: 7 },
  { left: 180, top: 4, width: 16, height: 7 },
];
const ESCALATOR_LENGTH = 56;
const TRAIN = { left: 70, width: 156, cars: 3 };
const subwayLook = {
  wall: 'concrete',
  wallLight: 'concrete-light',
  wallDark: 'concrete-dark',
  floor: ['concrete-light', 'concrete', 'concrete-dark'],
};

function drawSubwaySign(room, left, top) {
  room.fillRect(left, top, 24, 9, 'cloth-blue');
  room.strokeRect(left, top, 24, 9, 'white');
  room.fillRect(left + 3, top + 2, 5, 5, 'white');
  room.fillRect(left + 4, top + 3, 3, 3, 'cloth-blue');
  room.hline(left + 10, top + 4, 11, 'white');
}

// Opens the slab under `level` so an escalator can pass through.
function drawEscalatorRun(room, left, level) {
  const topRow = floorRowOf(level);
  const bottomRow = floorRowOf(level + 1);
  room.fillRect(left, topRow + 1, ESCALATOR_LENGTH, slabHeight, 'charcoal');
  for (let step = 0; step < ESCALATOR_LENGTH; step++) {
    const y = topRow + Math.round((step * (bottomRow - topRow)) / ESCALATOR_LENGTH);
    room.set(left + step, y, 'silver');
    room.set(left + step, y + 1, 'slate');
    room.set(left + step, y - 8, 'gray');
    if (step % 4 === 0) {
      room.vline(left + step, y + 2, bottomRow - y - 2, 'charcoal');
    }
  }
}

function drawTicketGates(room, left) {
  const top = floorRowOf(1) - 9;
  [0, 14, 28].forEach((offset) => {
    room.fillRect(left + offset, top, 6, 10, 'silver');
    room.strokeRect(left + offset, top, 6, 10, 'ink');
    room.set(left + offset + 2, top + 2, 'lamp');
  });
}

function drawTrain(room) {
  const top = floorRowOf(PLATFORM_LEVEL) - 21;
  const carWidth = TRAIN.width / TRAIN.cars;
  room.fillRect(TRAIN.left, top, TRAIN.width, 22, 'cloud');
  room.hline(TRAIN.left, top, TRAIN.width, 'white');
  room.fillRect(TRAIN.left, top + 14, TRAIN.width, 6, 'cloth-blue');
  room.hline(TRAIN.left, top + 20, TRAIN.width, 'night');
  room.strokeRect(TRAIN.left, top, TRAIN.width, 22, 'ink');
  for (let car = 0; car < TRAIN.cars; car++) {
    const left = TRAIN.left + car * carWidth;
    room.vline(left, top, 22, 'ink');
    for (let window = 0; window < 3; window++) {
      room.fillRect(left + 6 + window * 14, top + 4, 8, 7, 'lamp');
      room.fillRect(left + 8 + window * 14, top + 6, 4, 3, 'lamp-glow');
    }
    room.fillRect(left + carWidth - 10, top + 3, 4, 17, 'lamp-glow');
    room.vline(left + carWidth - 8, top + 3, 17, 'ink');
  }
}

function drawPlatform(room) {
  const row = floorRowOf(PLATFORM_LEVEL);
  const top = PLATFORM_LEVEL * floorHeight;
  room.fillRect(1, top + 6, room.width - 2, 20, 'charcoal');
  for (let x = 6; x < room.width - 6; x += 40) {
    room.hline(x, top + 3, 12, 'lamp');
  }
  room.fillRect(1, row - 2, room.width - 2, 3, 'lamp');
  for (let x = 1; x < room.width - 1; x += 6) {
    room.hline(x, row - 2, 3, 'ink');
  }
  room.hline(1, row + 1, room.width - 2, 'silver');
  room.hline(1, row + 2, room.width - 2, 'slate');
}

function drawSubwayStation(occupied) {
  const room = roomShell(30, subwayLook, SUBWAY_FLOORS);
  SUBWAY_WINDOWS.forEach((window) => drawWindow(room, window));
  drawSubwaySign(room, 108, 16);
  drawSubwaySign(room, 36, floorHeight + 6);
  drawTicketGates(room, 150);
  drawTicketGates(room, 192);
  drawPlatform(room);
  drawEscalatorRun(room, 76, 0);
  drawEscalatorRun(room, 8, 1);
  if (occupied) {
    drawTrain(room);
    standOnFloor(room, 66, worker('3'), 1);
    standOnFloor(room, 140, worker('1'), 1);
  }
  return room;
}

export function securitySprites() {
  return serviceSprites('security', { windows: SECURITY_WINDOWS, drawDay: drawSecurity });
}

export function medicalCenterSprites() {
  return serviceSprites('medical-center', { windows: MEDICAL_WINDOWS, drawDay: drawMedical });
}

export function parkingRampSprites() {
  return serviceSprites('parking-ramp', { drawDay: drawParkingRamp });
}

export function parkingSpaceSprites() {
  const disconnected = drawDisconnectedParkingSpace();
  return [
    ...serviceSprites('parking-space', { drawDay: drawParkingSpace }),
    { id: 'units/parking-space/disconnected_day', canvas: disconnected },
    { id: 'units/parking-space/disconnected_night', canvas: nightVersion(disconnected, []) },
  ];
}

export function recyclingCenterSprites() {
  return serviceSprites('recycling-center', {
    windows: RECYCLING_WINDOWS,
    drawDay: drawRecycling,
  });
}

export function subwayStationSprites() {
  return serviceSprites('subway-station', {
    windows: SUBWAY_WINDOWS,
    drawDay: drawSubwayStation,
  });
}
