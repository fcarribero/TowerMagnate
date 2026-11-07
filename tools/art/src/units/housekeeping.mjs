import { FLOOR_ROW, drawDoor, drawWindow, roomShell, unitSprites } from './shell.mjs';

const WIDTH_TILES = 15;
const WINDOWS = [
  { left: 49, top: 4, width: 12, height: 7 },
  { left: 81, top: 4, width: 12, height: 7 },
];
const DOOR = { left: 3, top: 10, width: 6, height: FLOOR_ROW - 12 };

const look = {
  wall: 'concrete-light',
  wallLight: 'cloud',
  wallDark: 'concrete',
  floor: ['silver', 'gray', 'slate'],
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
  y: 'lamp',
  n: 'night',
  1: 'skin-light',
  2: 'skin-mid',
  3: 'skin-dark',
};

const linenShelf = [
  'oooooooooooooo',
  'o.wwww..bbbb.o',
  'o.CCCC..bbbb.o',
  'o.wwww..bbbb.o',
  'llllllllllllll',
  'o.bbb..wwwww.o',
  'o.bbb..CCCCC.o',
  'o.bbb..wwwww.o',
  'llllllllllllll',
  'o.CCCCC..ww..o',
  'o.wwwww..CC..o',
  'o.CCCCC..ww..o',
  'llllllllllllll',
  'o............o',
  'o..wwwwwwww..o',
  'o..CCCCCCCC..o',
  'llllllllllllll',
  'd............d',
];

const washer = [
  'wwwwwwwwwv',
  'wvvvvvkvyg',
  'wggggggggg',
  'wv..ss..vg',
  'wv.snnns.g',
  'wvsnCnnnsg',
  'wvsnnnnnsg',
  'wv.snnns.g',
  'wv..ss...g',
  'wvvvvvvvvg',
  'gggggggggg',
];

const cart = [
  '.wwCww....',
  'bbbbbbb..g',
  'bbbbbbb..g',
  'bbbbbbbggg',
  'bbbbbbb..g',
  'gggggggggg',
  'g........g',
  'k........k',
];

const sink = ['vvvvvvvv', 'gvvvvvvg', '.gvvvvg.', '...gg...', '...gg...'];
const timeClock = ['ggggg', 'gwwwg', 'gwkwg', 'ggggg', '.vvv.'];

// Uniform from the style guide: cloud dress with a cloth-blue apron.
function maid(skin) {
  return [
    '.ccc.',
    `.${skin}${skin}${skin}.`,
    `.${skin}${skin}${skin}.`,
    '.CCC.',
    'CCCCC',
    'CbbbC',
    `${skin}bbb${skin}`,
    '.bbb.',
    '.bbb.',
    '.CCC.',
    '.CCC.',
    '.k.k.',
    '.k.k.',
  ];
}

function standOnFloor(room, left, map) {
  room.drawMap(left, FLOOR_ROW - map.length + 1, map, legend);
}

function drawHousekeeping(occupied) {
  const room = roomShell(WIDTH_TILES, look);
  WINDOWS.forEach((window) => drawWindow(room, window));
  drawDoor(room, DOOR, { open: occupied, sign: false });
  room.drawMap(12, 9, timeClock, legend);

  standOnFloor(room, 19, linenShelf);
  standOnFloor(room, 35, linenShelf);
  standOnFloor(room, 64, washer);
  standOnFloor(room, 75, washer);
  room.drawMap(93, 15, sink, legend);
  room.vline(96, 20, FLOOR_ROW - 19, 'gray');
  room.vline(97, 20, FLOOR_ROW - 19, 'gray');

  standOnFloor(room, 52, cart);
  standOnFloor(room, 108, cart);
  if (occupied) {
    standOnFloor(room, 13, maid('1'));
    standOnFloor(room, 86, maid('2'));
    standOnFloor(room, 102, maid('3'));
  }
  return room;
}

export function housekeepingSprites() {
  return unitSprites('housekeeping', { windows: WINDOWS, drawDay: drawHousekeeping });
}
