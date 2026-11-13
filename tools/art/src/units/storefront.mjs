import { FLOOR_ROW, roomShell } from './shell.mjs';
import { toNight } from '../night.mjs';

export const SHOP_STATES = ['closed', 'open', 'busy'];
const TIMES = ['day', 'night'];

const SIGN_TOP = 2;
const SIGN_HEIGHT = 6;
const AWNING_TOP = SIGN_TOP + SIGN_HEIGHT;
const AWNING_HEIGHT = 3;
const FRONT_TOP = AWNING_TOP + AWNING_HEIGHT;
const SIDE_MARGIN = 2;

export const legend = {
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
  L: 'leaf',
  D: 'leaf-dark',
  r: 'cloth-red',
  b: 'cloth-blue',
  y: 'lamp',
  e: 'dusk',
  1: 'skin-light',
  2: 'skin-mid',
  3: 'skin-dark',
};

const customerBody = (skin, shirt) => [
  '.ddd.',
  `.${skin}${skin}${skin}.`,
  `.${skin}${skin}${skin}.`,
  `.${shirt}${shirt}${shirt}.`,
  `${shirt}${shirt}${shirt}${shirt}${shirt}`,
  `${skin}${shirt}${shirt}${shirt}${skin}`,
  '.sss.',
  '.sss.',
  '.s.s.',
  '.k.k.',
];

export function placeOnFloor(room, left, rows) {
  room.drawMap(left, FLOOR_ROW - rows.length + 1, rows, legend);
}

export function placeCustomers(room, customers) {
  customers.forEach(([left, skin, shirt]) => placeOnFloor(room, left, customerBody(skin, shirt)));
}

function drawSign(room, { signColor, textWidth }, lit) {
  const signText = lit ? 'lamp-glow' : 'gray';
  const width = room.width;
  const panelLeft = SIDE_MARGIN + 2;
  const panelWidth = width - 2 * panelLeft;
  room.fillRect(panelLeft, SIGN_TOP, panelWidth, SIGN_HEIGHT, signColor);
  room.strokeRect(panelLeft, SIGN_TOP, panelWidth, SIGN_HEIGHT, 'ink');
  const textLeft = panelLeft + Math.floor((panelWidth - textWidth) / 2);
  for (let x = textLeft; x < textLeft + textWidth; x += 2) {
    room.vline(x, SIGN_TOP + 2, 2, signText);
  }
  room.hline(textLeft, SIGN_TOP + 4, textWidth - 1, signText);
}

function drawAwning(room, [stripeA, stripeB]) {
  const width = room.width - 2 * SIDE_MARGIN;
  for (let x = 0; x < width; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0 ? stripeA : stripeB;
    room.fillRect(SIDE_MARGIN + x, AWNING_TOP, 1, AWNING_HEIGHT, stripe);
    if (x % 4 === 1 || x % 4 === 2) {
      room.set(SIDE_MARGIN + x, AWNING_TOP + AWNING_HEIGHT, stripe);
    }
  }
  room.hline(SIDE_MARGIN, AWNING_TOP, width, 'ink');
}

// Rolling shutter over the whole front: slat lines every second row.
function drawShutter(room) {
  const width = room.width - 2 * SIDE_MARGIN;
  const top = FRONT_TOP + 1;
  const height = FLOOR_ROW + 1 - top;
  room.fillRect(SIDE_MARGIN, top, width, height, 'gray');
  for (let y = top + 1; y < top + height; y += 2) {
    room.hline(SIDE_MARGIN, y, width, 'slate');
  }
  room.fillRect(SIDE_MARGIN, top, width, 1, 'silver');
  room.fillRect(room.width / 2 - 2, top + height - 3, 4, 2, 'charcoal');
}

function drawCeilingLamps(room, lamps, lit) {
  lamps.forEach((x) => {
    room.vline(x, FRONT_TOP + 1, 2, 'gray');
    room.hline(x - 1, FRONT_TOP + 3, 3, lit ? 'lamp' : 'gray');
  });
}

// One shop front: sign, striped awning, then either the shutter (closed) or the
// interior with its lamps (open, busy). `look.drawInterior` places the furniture.
// `lampsOn` is false for an empty shop at night.
function drawShop(widthTiles, look, state, lampsOn = true) {
  const room = roomShell(widthTiles, look.shell);
  drawSign(room, look, state !== 'closed');
  drawAwning(room, look.awning);
  if (state === 'closed') {
    drawShutter(room);
    return room;
  }
  look.drawInterior(room);
  drawCeilingLamps(room, look.lamps, lampsOn);
  if (state === 'busy') {
    placeCustomers(room, look.customers);
  }
  return room;
}

// Six sprites per shop: closed, open and busy, each by day and by night.
export function shopSprites(subject, widthTiles, look) {
  const sprites = [];
  for (const state of SHOP_STATES) {
    const day = drawShop(widthTiles, look, state);
    for (const time of TIMES) {
      const canvas =
        time === 'day' ? day : toNight(drawShop(widthTiles, look, state, state !== 'open'));
      sprites.push({ id: `units/${subject}/${state}_${time}`, canvas });
    }
  }
  return sprites;
}
