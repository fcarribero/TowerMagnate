import { PixelCanvas } from '../canvas.mjs';
import { restaurantLook } from '../units/food.mjs';
import { closedShopOverlay } from '../units/storefront.mjs';
import { mirror } from './condo.mjs';
import { clock, legend as officeLegend, plantMedium, propSprites } from './office.mjs';

// Restaurant props, placed by the client on top of the bare shop (units/restaurant/empty_day).
// Looks: `idle` is the restaurant open with the tables laid, `busy` is the restaurant serving
// (plates and wine on the tables, candles lit). Diners and staff walk in as people, never as
// part of a prop. The overlay `restaurant/overlay/closed` is the unlit sign and the shutter.
// The sizes here must match apps/web/src/render/interior/restaurant.ts.

const legend = { ...officeLegend, e: 'dusk', n: 'night' };

function map(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = new PixelCanvas(width, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function idle(canvas) {
  return { idle: canvas };
}

/** The same body in both looks, with `busy` drawn over it when the restaurant is serving. */
function serving(rows, busy) {
  const draw = (on) => {
    const canvas = map(rows);
    if (on) busy(canvas);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// A table for two with a cloth, a candle and a chair facing it from each side.
function tableForTwo() {
  return serving(
    [
      '..........y.........',
      '..........g.........',
      '....wwwwwwwwwwww....',
      'o...rwrwrwrwrwrw...o',
      'o....wwwwwwwwww....o',
      'oooo.....dd.....oooo',
      'd..d.....dd.....d..d',
      'd..d.....dd.....d..d',
      'd..d....kkkk....d..d',
    ],
    (canvas) => {
      canvas.drawMap(5, 0, ['..r.', 'wwwC'], legend);
      canvas.drawMap(13, 0, ['r...', 'wwwC'], legend);
      canvas.set(10, 0, 'lamp-glow');
    },
  );
}

// A round table for four, seen from the side, with two chairs showing.
function tableForFour() {
  return serving(
    [
      '.................',
      '...wwwwwwwwwww...',
      '...CwwwwwwwwwC...',
      'o....CCCCCCC....o',
      'o.......d.......o',
      'oooo....d....oooo',
      'd..d....d....d..d',
      'd..d....d....d..d',
      'd..d..kkkkk..d..d',
    ],
    (canvas) => canvas.drawMap(4, 0, ['wCw.r.wCw'], legend),
  );
}

// The bar with three stools and bottles behind it on the counter.
function bar() {
  return serving(
    [
      '..y.r.L..y.r.L..y.r.L...',
      '..y.r.L..y.r.L..y.r.L...',
      'oooooooooooooooooooooooo',
      'dddddddddddddddddddddddd',
      'olllllllllllllllllllllld',
      'olllllllllllllllllllllld',
      'oooooooooooooooooooooooo',
      '..rrr.....rrr.....rrr...',
      '...s.......s.......s....',
      '...s.......s.......s....',
      '..sss.....sss.....sss...',
    ],
    (canvas) => canvas.drawMap(6, 1, ['w.....w.....w'], legend),
  );
}

function hostStand() {
  return serving(
    [
      '.y....',
      'oooooo',
      'olllld',
      'olllld',
      'olllld',
      'olllld',
      'olllld',
      'olllld',
      'oooooo',
      'd....d',
    ],
    (canvas) => canvas.set(1, 0, 'lamp-glow'),
  );
}

function piano() {
  return idle(
    map([
      'kkkkkkkkkkkkkkkkk.',
      'kcccccccccccccccck',
      'kcccccccccccccccck',
      'kcccccccccccccccck',
      'kkkkkkkkkkkkkkkkkk',
      'wkwkwwkwkwkwwkwkwk',
      'wwwwwwwwwwwwwwwwww',
      'kkkkkkkkkkkkkkkkkk',
      'k.k............k.k',
      'k.k............k.k',
      'k.k...kk.kk....k.k',
      'k.k............k.k',
    ]),
  );
}

// Against the back wall.

function wineRack() {
  return idle(
    map([
      'oooooooooooooo',
      'orrrrdrrrrdrro',
      'ollllllllllllo',
      'odrrrrdrrrrdro',
      'ollllllllllllo',
      'orrdrrrrdrrrro',
      'ollllllllllllo',
      'odrrrrdrrrdrro',
      'ollllllllllllo',
      'orrrrdrrrrrdro',
      'ollllllllllllo',
      'oooooooooooooo',
      'd............d',
      'd............d',
    ]),
  );
}

function sideboard() {
  return idle(
    map([
      '.wwww...CCC...',
      '.CCCC..wwwww..',
      'llllllllllllll',
      'oooooooooooooo',
      'od....oo....do',
      'od....oo....do',
      'oooooooooooooo',
      'd............d',
    ]),
  );
}

function coatStand() {
  return idle(
    map([
      'd.d.d',
      '.ddd.',
      '..d..',
      '.rr..',
      'rrrr.',
      'rr...',
      '..d..',
      '..d..',
      '..d..',
      '..d..',
      '..d..',
      '..d..',
      '.ddd.',
      'dd.dd',
    ]),
  );
}

// A lobster tank.
function aquarium() {
  return idle(
    map([
      'kkkkkkkkkkkkkkkk',
      'kSSSSSSSSSSSSSSk',
      'kSBSSSSSSSBSSSSk',
      'kSSSSSrSrSSSSSSk',
      'kSSSSSrrrSSSSSSk',
      'kSBSSrrrrrSSSBSk',
      'kSSSSSSSSSSSSSSk',
      'kDDDDDDDDDDDDDDk',
      'kkkkkkkkkkkkkkkk',
      'oooooooooooooooo',
      'od............do',
      'dd............dd',
    ]),
  );
}

// On the wall.

function painting() {
  return idle(map(['kkkkkkkk', 'kbbbLLLk', 'kbbLLLLk', 'kssssssk', 'kkkkkkkk']));
}

function paintingLarge() {
  return idle(
    map([
      'llllllllllllll',
      'lSSSSSSSSyySSl',
      'lSSSSSSSSyySSl',
      'lSSSSDDSSSSSSl',
      'lSSSDLLDSSSSSl',
      'lSSDLLLLDDSSSl',
      'lLLLLLLLLLLLLl',
      'lLLDLLLLLDLLLl',
      'llllllllllllll',
    ]),
  );
}

// A blackboard with the day's specials.
function specialsBoard() {
  return idle(
    map([
      'oooooooooo',
      'oDDDDDDDDo',
      'oDwwwDDwDo',
      'oDDDDDDDDo',
      'oDwwDwwwDo',
      'oDDDDDDDDo',
      'oDwwwDwwDo',
      'oooooooooo',
    ]),
  );
}

// A wall light; lit while the restaurant is serving.
function sconce() {
  return serving(['.y.', 'yyy', '.d.', '.d.', 'ddd'], (canvas) =>
    canvas.drawMap(0, 0, ['.Y.', 'YYY'], legend),
  );
}

export function restaurantProps() {
  return {
    'table-two': tableForTwo(),
    'table-four': tableForFour(),
    bar: bar(),
    'host-stand': hostStand(),
    piano: piano(),
    'wine-rack': wineRack(),
    sideboard: sideboard(),
    'coat-stand': coatStand(),
    aquarium: aquarium(),
    'plant-medium': idle(plantMedium()),
    painting: painting(),
    'painting-large': paintingLarge(),
    'specials-board': specialsBoard(),
    sconce: sconce(),
    mirror: mirror(),
    clock: idle(clock()),
  };
}

export const restaurantGroup = {
  name: 'restaurant',
  draw() {
    return propSprites(
      'restaurant',
      restaurantProps(),
      [],
      [{ id: 'restaurant/overlay/closed', canvas: closedShopOverlay(24, restaurantLook) }],
    );
  },
};
