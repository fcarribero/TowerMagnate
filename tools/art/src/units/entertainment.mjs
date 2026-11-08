import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';
import { FLOOR_ROW, drawDoor, drawWindow, nightVersion, roomShell } from './shell.mjs';

const { floorHeight, slabHeight, tileWidth } = metrics;
const FLOORS = 2;
const HEIGHT = FLOORS * floorHeight;

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
  D: 'leaf-dark',
  S: 'sky',
  F: 'sky-light',
  G: 'glass',
  1: 'skin-light',
  2: 'skin-mid',
  3: 'skin-dark',
};

function floorRow(level) {
  return level * floorHeight + FLOOR_ROW;
}

// Both rooms are one tall space, so the slab between the two floors is replaced by wall.
function openMidFloor(canvas, { wall, wallLight, wallDark, floor }) {
  const top = floorRow(0) - floor.length + 1;
  const width = canvas.width;
  canvas.fillRect(2, top, width - 4, floorHeight - top, wall);
  canvas.vline(1, top, floorHeight - top, wallLight);
  canvas.vline(width - 2, top, floorHeight - top, wallDark);
  canvas.fillRect(0, top, 1, floorHeight - top, 'ink');
  canvas.fillRect(width - 1, top, 1, floorHeight - top, 'ink');
}

function standOnFloor(canvas, left, map, level = 1) {
  canvas.drawMap(left, floorRow(level) - map.length + 1, map, legend);
}

// An empty and an active state, each drawn for day and for night.
function stateSprites(subject, activeState, { drawDay, drawNight }) {
  const sprites = [];
  for (const [state, active] of [
    ['empty', false],
    [activeState, true],
  ]) {
    const day = drawDay(active);
    sprites.push({ id: `units/${subject}/${state}_day`, canvas: day });
    sprites.push({ id: `units/${subject}/${state}_night`, canvas: drawNight(day, active) });
  }
  return sprites;
}

// Cinema, 31 x 2 tiles: a lobby with a ticket booth on the left and an auditorium
// on the right, with a screen that spans both floors above two blocks of seats.

const CINEMA_WIDTH = 31 * tileWidth;
const LOBBY_WIDTH = 9 * tileWidth;
const HALL_LEFT = LOBBY_WIDTH + 4;
const SCREEN = { left: HALL_LEFT + 24, top: 8, width: 140, height: 38 };
const SEAT_ROWS = [
  { top: 49, left: HALL_LEFT + 26, count: 18 },
  { top: floorRow(1) - 3, left: HALL_LEFT + 20, count: 20 },
];
const SEAT_PITCH = 6;
const PROJECTOR = { x: HALL_LEFT + 6, y: 20 };

const cinemaPalette = {
  wall: 'charcoal',
  wallLight: 'slate',
  wallDark: 'ink',
  floor: ['wood-dark', 'wood-dark'],
};

const ticketBooth = [
  '.yyyyyyyyyyyy.',
  '.rrrrrrrrrrrr.',
  '.dddddddddddd.',
  '.dllllllllllld',
  '.dllGGGGGGllld',
  '.dllGGGGGGllld',
  '.doooooooooood',
  '.doooooooooood',
  '.dddddddddddd.',
];
const poster = ['kkkkkk', 'kSSFFk', 'kSwwFk', 'kSwrFk', 'kyyyyk', 'kkkkkk'];
const popcorn = ['.w.w.', 'wywyw', 'rwrwr', '.rwr.', '.rwr.'];
const seat = ['.rr.', 'rrrr', 'rrrr', 'rddr'];
const viewers = [
  ['.2.', '222'],
  ['.1.', '111'],
  ['.3.', '333'],
];
const exitLamp = ['.yy.', 'yYYy', '.yy.', '.dd.'];

function drawScreen(canvas, showing) {
  const { left, top, width, height } = SCREEN;
  canvas.fillRect(left - 2, top - 2, width + 4, height + 4, 'ink');
  canvas.hline(left - 2, top - 2, width + 4, 'silver');
  canvas.fillRect(left - 6, top, 4, height, 'cloth-red');
  canvas.fillRect(left + width + 2, top, 4, height, 'cloth-red');
  if (!showing) {
    canvas.fillRect(left, top, width, height, 'charcoal');
    canvas.hline(left, top, width, 'slate');
    return;
  }
  canvas.fillRect(left, top, width, height, 'sky');
  canvas.fillRect(left, top, width, 12, 'sky-light');
  canvas.fillRect(left, top + height - 9, width, 9, 'leaf');
  canvas.hline(left, top + height - 9, width, 'leaf-dark');
  canvas.drawMap(left + 104, top + 4, ['..yyy.', '.yYYYy', '.yYYYy', '..yyy.'], legend);
  canvas.drawMap(left + 18, top + 8, ['...www....', '.wwwwwww..', 'wwwwwwwwww'], legend);
  canvas.drawMap(left + 60, top + 17, ['..rr..', '.rrrr.', 'rrwwrr', 'rrrrrr', '.k..k.'], legend);
  canvas.strokeRect(left, top, width, height, 'white');
}

function drawProjectorBeam(canvas) {
  const { left, top, height } = SCREEN;
  const length = left - PROJECTOR.x;
  for (let x = PROJECTOR.x + 4; x < left; x += 2) {
    const spread = Math.round(((x - PROJECTOR.x) * height) / length / 2);
    canvas.set(x, PROJECTOR.y - spread, 'lamp-glow');
    canvas.set(x, PROJECTOR.y + spread, 'lamp-glow');
  }
  canvas.fillRect(PROJECTOR.x - 3, PROJECTOR.y - 2, 6, 5, 'gray');
  canvas.set(PROJECTOR.x + 3, PROJECTOR.y, 'lamp-glow');
  canvas.set(left, top + height / 2, 'lamp-glow');
}

function drawSeats(canvas, showing) {
  SEAT_ROWS.forEach(({ top, left, count }, rowIndex) => {
    for (let index = 0; index < count; index++) {
      const x = left + index * SEAT_PITCH;
      const isTaken = (index * 5 + rowIndex * 3) % 7 !== 0;
      if (showing && isTaken) {
        canvas.drawMap(x, top - 2, viewers[(index + rowIndex) % viewers.length], legend);
      }
      canvas.drawMap(x, top, seat, legend);
    }
  });
}

function drawLobby(canvas, showing) {
  const wallHeight = HEIGHT - slabHeight;
  canvas.fillRect(LOBBY_WIDTH, 0, 4, wallHeight, 'slate');
  canvas.vline(LOBBY_WIDTH, 0, wallHeight, 'ink');
  [10, 26, 42].forEach((x) => canvas.drawMap(x, 40, poster, legend));
  standOnFloor(canvas, 8, ticketBooth);
  standOnFloor(canvas, 56, popcorn);
  drawDoor(canvas, { left: 2, top: 14, width: 5, height: 14 }, { open: showing, sign: !showing });
}

function drawCinema(showing) {
  const canvas = roomShell(31, cinemaPalette, FLOORS);
  openMidFloor(canvas, cinemaPalette);
  drawLobby(canvas, showing);
  drawScreen(canvas, showing);
  if (showing) {
    drawProjectorBeam(canvas);
  }
  drawSeats(canvas, showing);
  canvas.drawMap(CINEMA_WIDTH - 12, 6, exitLamp, legend);
  return canvas;
}

// The auditorium has no windows, so night only steps the materials down. The
// screen picture keeps its colors because toNight leaves sky and lamp alone.
export function cinemaSprites() {
  return stateSprites('cinema', 'show', {
    drawDay: drawCinema,
    drawNight: (day) => toNight(day),
  });
}

// Party hall, 24 x 2 tiles: a double-height room with tall windows, a dance floor
// and a bar. The party state adds a lit disco ball, streamers, balloons and guests.

const PARTY_WIDTH = 24 * tileWidth;
const PARTY_WINDOWS = [
  { left: 14, top: 10, width: 14, height: 40 },
  { left: PARTY_WIDTH - 28, top: 10, width: 14, height: 40 },
];
const DANCE_FLOOR = { left: 52, width: 88 };
const DISCO_BALL = { x: 93, y: 9 };

const partyPalette = {
  wall: 'cloud',
  wallLight: 'white',
  wallDark: 'silver',
  floor: ['wood-light', 'wood'],
};

const bar = [
  'ddddddddddddddd',
  'dlllllllllllllo',
  'doooooooooooooo',
  'dododododododod',
  'doooooooooooooo',
  'doooooooooooooo',
];
const bottles = ['.L.y.r.', 'LLyyrr.', 'DLyyrb.'];
const table = ['wwwwww', '.cccc.', '..cc..', '..cc..', '.cccc.'];
const balloons = {
  red: ['.rr.', 'rrrr', 'rrrr', '.rr.', '..d.'],
  blue: ['.bb.', 'bbbb', 'bbbb', '.bb.', '..d.'],
  gold: ['.yy.', 'yyYy', 'yyyy', '.yy.', '..d.'],
};
const discoBall = ['..vv..', '.vwvv.', 'vvwvvg', 'vvvvgg', '.vggg.', '..gg..'];
const dancers = [
  ['.2.', '222', 'rrr', 'r.r', '2.2'],
  ['.1.', '111', 'bbb', 'b.b', '1.1'],
  ['.3.', '333', 'yyy', 'y.y', '3.3'],
];
const confetti = [
  [20, 30, 'cloth-red'],
  [34, 22, 'lamp'],
  [47, 34, 'cloth-blue'],
  [66, 18, 'leaf'],
  [88, 36, 'cloth-red'],
  [104, 24, 'lamp'],
  [121, 32, 'cloth-blue'],
  [140, 20, 'leaf'],
  [152, 38, 'cloth-red'],
  [30, 44, 'leaf'],
  [96, 46, 'lamp'],
  [150, 28, 'white'],
];

function drawDanceFloor(canvas, partying) {
  const top = floorRow(1);
  const checkers = partying
    ? [
        ['cloth-red', 'lamp'],
        ['cloth-blue', 'leaf'],
      ]
    : [
        ['silver', 'gray'],
        ['gray', 'silver'],
      ];
  for (let x = DANCE_FLOOR.left; x < DANCE_FLOOR.left + DANCE_FLOOR.width; x += 4) {
    const [upper, lower] = checkers[((x - DANCE_FLOOR.left) / 4) % 2];
    canvas.fillRect(x, top - 1, 4, 1, upper);
    canvas.fillRect(x, top, 4, 1, lower);
  }
}

function drawStreamers(canvas) {
  const colors = ['cloth-red', 'lamp', 'cloth-blue', 'leaf'];
  const span = 38;
  for (let x = 40; x < PARTY_WIDTH - 40; x++) {
    const sag = Math.round(5 * Math.sin((Math.PI * ((x - 40) % span)) / span));
    canvas.set(x, 3 + sag, colors[Math.floor((x - 40) / span) % colors.length]);
  }
}

function drawPartyHall(partying) {
  const canvas = roomShell(24, partyPalette, FLOORS);
  openMidFloor(canvas, partyPalette);
  PARTY_WINDOWS.forEach((window) => drawWindow(canvas, window));
  drawDoor(
    canvas,
    { left: 90, top: 46, width: 12, height: 14 },
    { open: partying, sign: !partying },
  );
  drawDanceFloor(canvas, partying);
  standOnFloor(canvas, 150, bar);
  canvas.drawMap(152, floorRow(1) - bar.length - bottles.length + 1, bottles, legend);
  standOnFloor(canvas, 30, table);
  canvas.drawMap(36, 6, balloons.blue, legend);
  canvas.drawMap(PARTY_WIDTH - 40, 6, balloons.red, legend);
  canvas.vline(DISCO_BALL.x + 3, 0, DISCO_BALL.y, 'slate');
  canvas.drawMap(DISCO_BALL.x, DISCO_BALL.y, discoBall, legend);
  if (!partying) {
    return canvas;
  }
  drawStreamers(canvas);
  canvas.drawMap(30, 8, balloons.red, legend);
  canvas.drawMap(150, 8, balloons.gold, legend);
  [60, 84, 108, 126].forEach((x, index) => {
    standOnFloor(canvas, x, dancers[index % dancers.length]);
  });
  standOnFloor(canvas, 72, dancers[2]);
  confetti.forEach(([x, y, color]) => canvas.set(x, y, color));
  return canvas;
}

// Windows glow while the party runs and stay dark when the hall is empty.
export function partyHallSprites() {
  return stateSprites('party-hall', 'party', {
    drawDay: drawPartyHall,
    drawNight: (day, partying) => nightVersion(day, PARTY_WINDOWS, partying),
  });
}
