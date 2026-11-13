import { FLOOR_ROW, drawWindow, roomShell, unitSprites } from './shell.mjs';

const WIDTH_TILES = 9;
const WINDOWS = [
  { left: 5, top: 4, width: 14, height: 8 },
  { left: 33, top: 4, width: 14, height: 8 },
];
const DESKS = [6, 34];

const look = {
  wall: 'cloud',
  wallLight: 'white',
  wallDark: 'silver',
  floor: ['silver', 'gray', 'slate'],
};

const legend = {
  k: 'ink',
  c: 'charcoal',
  s: 'slate',
  g: 'gray',
  v: 'silver',
  w: 'white',
  d: 'wood-dark',
  o: 'wood',
  l: 'wood-light',
  L: 'leaf',
  D: 'leaf-dark',
  r: 'cloth-red',
};

// 16 wide desk with a monitor; the screen is filled in separately.
const desk = [
  '....cccccc......',
  '....c....c......',
  '....c....c......',
  '....c....c......',
  '....cccccc......',
  '......cc........',
  'llllllllllllllll',
  'oooooooooooooooo',
  'd.dddddddddddd.d',
  'd.d..........d.d',
  'd.d..........d.d',
  'd.d..........d.d',
  'd.dddddddddddd.d',
];

const chairTucked = ['..s.', '..s.', 'ssss', '..c.', '.c.c'];

// The back faces away from the desk, so the seat is turned toward it.
const chairPulledOut = ['...s', '...s', 'ssss', '.c..', 'c.c.'];

const cabinet = [
  'vvvvvv',
  'vggggs',
  'vgkkgs',
  'vggggs',
  'vsssss',
  'vggggs',
  'vgkkgs',
  'vggggs',
  'vsssss',
  'vggggs',
  'vgkkgs',
  'vggggs',
];

const plant = ['.L.L.', 'LDLLD', '.LDL.', 'L.D.L', '..D..', '.lol.', '.ooo.', '.ddd.'];

function drawDesk(room, left, occupied) {
  const top = FLOOR_ROW - desk.length + 1;
  room.drawMap(left, top, desk, legend);
  room.fillRect(left + 5, top + 1, 4, 3, occupied ? 'sky-light' : 'slate');
  if (occupied) {
    room.hline(left + 5, top + 2, 3, 'white');
    room.drawMap(left + 11, top + 4, ['ww.', 'wwr'], legend);
  }
  const chair = occupied ? chairPulledOut : chairTucked;
  const chairLeft = occupied ? left + 16 : left + 11;
  room.drawMap(chairLeft, FLOOR_ROW - chair.length + 1, chair, legend);
}

function drawOffice(occupied) {
  const room = roomShell(WIDTH_TILES, look);
  WINDOWS.forEach((window) => drawWindow(room, window));
  // A vacant office is a bare room; the furniture arrives with the tenant.
  if (occupied) {
    DESKS.forEach((left) => drawDesk(room, left, occupied));
    room.drawMap(55, FLOOR_ROW - cabinet.length + 1, cabinet, legend);
    room.drawMap(27, FLOOR_ROW - plant.length + 1, plant, legend);
  }
  return room;
}

export function officeSprites() {
  return unitSprites('office', { windows: WINDOWS, drawDay: drawOffice });
}
