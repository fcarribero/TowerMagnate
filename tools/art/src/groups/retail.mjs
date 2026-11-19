import { PixelCanvas } from '../canvas.mjs';
import { shopLooks } from '../units/retail.mjs';
import { closedShopOverlay } from '../units/storefront.mjs';
import { clock, legend as officeLegend, plantMedium, propSprites } from './office.mjs';

// Shop props for the four lines a shop can sell (clothes, books, grocery, electronics), placed
// by the client on top of the line's bare shop (units/retail-shop[-line]/empty_day). Looks:
// `idle` is the shop open, `busy` is the shop with customers in (lights on screens, goods on
// the counter). Customers and staff walk in as people, never as part of a prop; a mannequin is
// a dress form with no face. The overlay `retail/overlay/<line>-closed` is the line's unlit sign
// and shutter. The sizes here must match apps/web/src/render/interior/retail.ts.

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

function serving(rows, busy) {
  const draw = (on) => {
    const canvas = map(rows);
    if (on) busy(canvas);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// Every line.

// The till on a counter; with customers in, a bag waits on it.
function cashCounter() {
  return serving(
    [
      '..ggg.............',
      '.gwwwg............',
      '.gkkkg............',
      '.ggggg............',
      'llllllllllllllllll',
      'oooooooooooooooooo',
      'ollllllllllllllllo',
      'ollllllllllllllllo',
      'oooooooooooooooooo',
      'dddddddddddddddddd',
    ],
    (canvas) => canvas.drawMap(10, 0, ['.ww.', 'wwww', 'wrrw', 'wwww'], legend),
  );
}

function shopPoster() {
  return idle(
    map(['kkkkkkkk', 'krrrrrrk', 'krwwwwrk', 'krrrrrrk', 'kryyyyrk', 'krrrrrrk', 'kkkkkkkk']),
  );
}

// Clothes.

function garmentRack() {
  return idle(
    map([
      '.vvvvvvvvvv.',
      '.r.b.r.b.r..',
      '.r.b.r.b.r..',
      '.r.b.r.b.r..',
      '.r.b.r.b.r..',
      '....s.......',
      '....s.......',
      '....s.......',
      '....s.......',
      '...sss......',
    ]),
  );
}

// A dress form: a body on a pole, no head or face.
function dressForm() {
  return idle(map(['.s.', 'bbb', 'bbb', 'bbb', 'b.b', '.s.', '.s.', '.s.', 'sss']));
}

function clothesShelf() {
  return idle(
    map([
      'oooooooooooo',
      'o.rrr..bbb.o',
      'o.rrr..bbb.o',
      'llllllllllll',
      'o.LLL..www.o',
      'o.LLL..www.o',
      'llllllllllll',
      'o.yyy..rrr.o',
      'o.yyy..rrr.o',
      'llllllllllll',
      'o.bbb..LLL.o',
      'o.bbb..LLL.o',
      'llllllllllll',
      'd..........d',
    ]),
  );
}

function standingMirror() {
  return idle(
    map([
      'oooooo',
      'oSSSSo',
      'oSwSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oSSSSo',
      'oooooo',
      '.d..d.',
      'dd..dd',
    ]),
  );
}

function displayTable() {
  return idle(
    map([
      '.rr.bb.ww.LL..',
      '.rr.bb.ww.LL..',
      'llllllllllllll',
      'oooooooooooooo',
      '.d..........d.',
      '.d..........d.',
      '.d..........d.',
    ]),
  );
}

function shoeRack() {
  return idle(
    map([
      'oooooooooo',
      'o.kk..rr.o',
      'llllllllll',
      'o.bb..ww.o',
      'llllllllll',
      'o.rr..kk.o',
      'llllllllll',
      'd........d',
    ]),
  );
}

// Books.

function bookcase() {
  return idle(
    map([
      'oooooooooooooooo',
      'orbLyrbbLyrbLybo',
      'orbLyrbbLyrbLybo',
      'llllllllllllllll',
      'oLyrbbLrybLrbyLo',
      'oLyrbbLrybLrbyLo',
      'llllllllllllllll',
      'obyLrbyLrbyLrbyo',
      'obyLrbyLrbyLrbyo',
      'llllllllllllllll',
      'orbyLrbyLbrLyrbo',
      'orbyLrbyLbrLyrbo',
      'dddddddddddddddd',
      'd..............d',
    ]),
  );
}

function bookTable() {
  return idle(
    map([
      '.rrr.bbb.LLL.y',
      '.www.www.www.y',
      'llllllllllllll',
      'oooooooooooooo',
      '.d..........d.',
      '.d..........d.',
      '.d..........d.',
      '.d..........d.',
    ]),
  );
}

function readingChair() {
  return idle(
    map([
      'rr......',
      'rr......',
      'rr......',
      'rr......',
      'rrrrrrrr',
      'rddddddr',
      'oooooooo',
      'd......d',
    ]),
  );
}

function magazineRack() {
  return idle(
    map([
      'gggggggg',
      'gbrybLrg',
      'gbrybLrg',
      'gggggggg',
      'gyLrbrbg',
      'gyLrbrbg',
      'gggggggg',
      'g......g',
      'g......g',
      'ss....ss',
    ]),
  );
}

// Grocery.

function grocerShelf() {
  return idle(
    map([
      'vvvvvvvvvvvv',
      'vCeCLCyCeCLv',
      'vCeCLCyCeCLv',
      'vssssssssssv',
      'vyCeCLCyCeCv',
      'vyCeCLCyCeCv',
      'vssssssssssv',
      'vrCbCrCbCrCv',
      'vrCbCrCbCrCv',
      'vssssssssssv',
      'vLeLeLeLeLev',
      'vggggggggggv',
      'g..........g',
      'g..........g',
    ]),
  );
}

function produceStand() {
  return idle(
    map([
      'eLeLe.rLrLr',
      'LeLeL.LrLrL',
      'ooooooooooo',
      'olllllllllo',
      'ooooooooooo',
      '.d.......d.',
      '.d.......d.',
      'dd.......dd',
    ]),
  );
}

function grocerFridge() {
  return idle(
    map([
      'cccccccccc',
      'cGGGGGGGGc',
      'cGwwGwwwGc',
      'cGGGGGGGGc',
      'cGbbGyyGGc',
      'cGGGGGGGGc',
      'cGwwGwwwGc',
      'cGGGGGGGGc',
      'cGrrGbbGGc',
      'cGGGGGGGGc',
      'cccccccccc',
      'cwwwwwwwwc',
      'cccccccccc',
      'k........k',
    ]),
  );
}

function chestFreezer() {
  return idle(
    map([
      'wwwwwwwwwwwwwwww',
      'wSSSSSSSSSSSSSSw',
      'wwwwwwwwwwwwwwww',
      'wCCCCCCCCCCCCCCw',
      'wCCbbbbbbbbbbCCw',
      'wCCCCCCCCCCCCCCw',
      'wwwwwwwwwwwwwwww',
      'g..............g',
    ]),
  );
}

function breadShelf() {
  return idle(
    map([
      'oooooooooooo',
      'o.ll.ll.ll.o',
      'olllllllllll',
      'oooooooooooo',
      'o.ll..ll.l.o',
      'o.lll.ll.ll.',
      'oooooooooooo',
      'o..........o',
      'o..........o',
      'd..........d',
    ]),
  );
}

function baskets() {
  return idle(map(['rrrrrr', 'r.r.rr', 'rrrrrr', 'r.r.rr', 'rrrrrr', '.r..r.']));
}

function priceBoard() {
  return idle(
    map([
      'kkkkkkkkkkkk',
      'kDDDDDDDDDDk',
      'kDeeDwwDwwDk',
      'kDDDDDDDDDDk',
      'kDLLDwwDwwDk',
      'kDDDDDDDDDDk',
      'kkkkkkkkkkkk',
    ]),
  );
}

// Electronics.

function screenOn(canvas, left, top, width, height, on, color) {
  canvas.fillRect(left, top, width, height, on ? color : 'charcoal');
  if (on) canvas.hline(left + 1, top + 1, Math.max(1, width - 3), 'white');
}

function tvStand() {
  return serving(
    [
      'kkkkkkkkkkkk',
      'kccccckcccck',
      'kccccckcccck',
      'kccccckcccck',
      'kkkkkkkkkkkk',
      '.ss......ss.',
      'gggggggggggg',
      's..........s',
      's..........s',
      's..........s',
      's..........s',
    ],
    (canvas) => {
      screenOn(canvas, 1, 1, 5, 3, true, 'sky');
      screenOn(canvas, 7, 1, 4, 3, true, 'leaf');
    },
  );
}

function tvWall() {
  return serving(
    [
      'kkkkkkkkkkkkkkk',
      'kcccccckcccccck',
      'kcccccckcccccck',
      'kcccccckcccccck',
      'kcccccckcccccck',
      'kkkkkkkkkkkkkkk',
    ],
    (canvas) => {
      screenOn(canvas, 1, 1, 6, 4, true, 'sky-deep');
      screenOn(canvas, 8, 1, 6, 4, true, 'dusk');
    },
  );
}

function computerTable() {
  return serving(
    [
      'ssssss....ssssss',
      'sccccs....sccccs',
      'sccccs....sccccs',
      'ssssss....ssssss',
      '..ss........ss..',
      'gggggggggggggggg',
      '.s............s.',
      '.s............s.',
      '.s............s.',
    ],
    (canvas) => {
      screenOn(canvas, 1, 1, 4, 2, true, 'sky');
      screenOn(canvas, 11, 1, 4, 2, true, 'leaf');
    },
  );
}

function phoneCounter() {
  return serving(
    [
      '.k.k.k.k.k.k',
      '.c.c.c.c.c.c',
      'vvvvvvvvvvvv',
      'GGGGGGGGGGGG',
      'GSSSSSSSSSSG',
      'GGGGGGGGGGGG',
      'vvvvvvvvvvvv',
      's..........s',
    ],
    (canvas) => [1, 5, 9].forEach((x) => canvas.set(x, 1, 'sky-light')),
  );
}

function speaker() {
  return idle(
    map(['kkkkk', 'kcgck', 'kgcgk', 'kcgck', 'kkkkk', 'kcgck', 'kgkgk', 'kgggk', 'kcgck', 'kkkkk']),
  );
}

function boxShelf() {
  return idle(
    map([
      'gggggggggggg',
      'g.CCC..www.g',
      'g.CbC..wsw.g',
      'gggggggggggg',
      'g.www..CCC.g',
      'g.wkw..CrC.g',
      'gggggggggggg',
      'g.CCC..www.g',
      'g.CsC..wbw.g',
      'gggggggggggg',
      'g..........g',
      's..........s',
    ]),
  );
}

export function retailProps() {
  return {
    'cash-counter': cashCounter(),
    'shop-poster': shopPoster(),
    'plant-medium': idle(plantMedium()),
    clock: idle(clock()),
    'garment-rack': garmentRack(),
    'dress-form': dressForm(),
    'clothes-shelf': clothesShelf(),
    'standing-mirror': standingMirror(),
    'display-table': displayTable(),
    'shoe-rack': shoeRack(),
    bookcase: bookcase(),
    'book-table': bookTable(),
    'reading-chair': readingChair(),
    'magazine-rack': magazineRack(),
    'grocer-shelf': grocerShelf(),
    'produce-stand': produceStand(),
    'grocer-fridge': grocerFridge(),
    'chest-freezer': chestFreezer(),
    'bread-shelf': breadShelf(),
    baskets: baskets(),
    'price-board': priceBoard(),
    'tv-stand': tvStand(),
    'tv-wall': tvWall(),
    'computer-table': computerTable(),
    'phone-counter': phoneCounter(),
    speaker: speaker(),
    'box-shelf': boxShelf(),
  };
}

/** The shop lines and the units/ subject of each line's bare shop. */
export const RETAIL_LINES = {
  clothes: 'retail-shop',
  books: 'retail-shop-books',
  grocery: 'retail-shop-grocery',
  electronics: 'retail-shop-electronics',
};

export const retailGroup = {
  name: 'retail',
  draw() {
    return propSprites(
      'retail',
      retailProps(),
      [],
      Object.entries(RETAIL_LINES).map(([line, subject]) => ({
        id: `retail/overlay/${line}-closed`,
        canvas: closedShopOverlay(12, shopLooks[subject]),
      })),
    );
  },
};
