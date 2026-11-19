import { PixelCanvas } from '../canvas.mjs';
import { fastFoodLook } from '../units/food.mjs';
import { closedShopOverlay } from '../units/storefront.mjs';
import { clock, legend as officeLegend, plantMedium, propSprites } from './office.mjs';

// Fast food props, placed by the client on top of the bare shop (units/fast-food/empty_day).
// Looks: `idle` is the shop open and waiting, `busy` is the shop serving (food on the grill and
// on the tables). Customers and crew walk in as people, never as part of a prop.
// The overlay `fast-food/overlay/closed` is the sign with its lights off and the shutter down.
// The sizes here must match apps/web/src/render/interior/fastFood.ts.

const legend = { ...officeLegend, e: 'dusk' };

function map(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = new PixelCanvas(width, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function idle(canvas) {
  return { idle: canvas };
}

/** The same body in both looks, with `busy` drawn over it when the shop is serving. */
function serving(rows, busy) {
  const draw = (on) => {
    const canvas = map(rows);
    if (on) busy(canvas);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// Kitchen, against the back wall.

function fryer() {
  return serving(
    [
      '..c...c..',
      '..c...c..',
      '.ggg.ggg.',
      'vvvvvvvvv',
      'vsssssssv',
      'vvvvvvvvv',
      'vgggggggv',
      'vg.....gv',
      'vgggggggv',
      's.......s',
    ],
    // The baskets are up with fries in them.
    (canvas) => canvas.drawMap(1, 1, ['.yyy.yyy.', '.ggg.ggg.'], legend),
  );
}

function grill() {
  return serving(
    [
      '..........',
      '..........',
      'kkkkkkkkkk',
      'vvvvvvvvvv',
      'vsvsvsvsvv',
      'vvvvvvvvvv',
      'vg......gv',
      'vg......gv',
      'vvvvvvvvvv',
      's........s',
    ],
    // Patties on the griddle.
    (canvas) => canvas.drawMap(1, 1, ['ddd.ddd.dd'], legend),
  );
}

function sodaFountain() {
  return serving(
    [
      'vvvvvvvv',
      'vrbyrbyv',
      'vvvvvvvv',
      'v.k..k.v',
      'v......v',
      'vggggggv',
      'llllllll',
      'oooooooo',
      'od....do',
      'od....do',
      'oooooooo',
      'd......d',
    ],
    // A cup under a nozzle.
    (canvas) => canvas.drawMap(1, 4, ['ww'], legend),
  );
}

function shakeMachine() {
  return idle(
    map([
      '.vvvv.',
      'vwwwwv',
      'vrrrrv',
      'vvvvvv',
      'v.kk.v',
      'v....v',
      'vvvvvv',
      'oooooo',
      'o....o',
      'o....o',
      'd....d',
    ]),
  );
}

// A heat lamp over a shelf of wrapped burgers.
function warmer() {
  return serving(
    [
      '.YYYYYYYY.',
      'vvvvvvvvvv',
      'v........v',
      'v........v',
      'vvvvvvvvvv',
      '.g......g.',
      '.g......g.',
      '.g......g.',
      '.g......g.',
      '.g......g.',
      '.g......g.',
      'ss......ss',
    ],
    (canvas) => canvas.drawMap(1, 2, ['.ww.ee.ww.', 'wwweeeewww'], legend),
  );
}

function drinksFridge() {
  return idle(
    map([
      'cccccccc',
      'cGGGGGGc',
      'cGrrbbGc',
      'cGGGGGGc',
      'cGyyrrGc',
      'cGGGGGGc',
      'cGbbyyGc',
      'cGGGGGGc',
      'cGrrbbGc',
      'cGGGGGGc',
      'cccccccc',
      'cwrrrrwc',
      'cccccccc',
      'k......k',
    ]),
  );
}

// Dining room, against the back wall.

function trashBin() {
  return idle(
    map(['.rrrr.', 'rrrrrr', 'r.cc.r', 'rrrrrr', 'rrrrrr', 'rwwwwr', 'rrrrrr', 'rrrrrr', '.rrrr.']),
  );
}

// Napkins, ketchup and mustard on a stand.
function condimentStand() {
  return idle(
    map([
      '.w.r.y.',
      'ww.r.y.',
      'ooooooo',
      'ol...lo',
      'ol...lo',
      'ooooooo',
      'ol...lo',
      'ol...lo',
      'ooooooo',
      'd.....d',
    ]),
  );
}

// On the wall.

function menuBoard() {
  return idle(
    map([
      'kkkkkkkkkkkkkkkkkk',
      'kcccccccccccccccck',
      'kcrrcwwwwcyyycwwck',
      'kcccccccccccccccck',
      'kcrrcwwwwcyyycwwck',
      'kcccccccccccccccck',
      'kcrrcwwwwcyyycwwck',
      'kkkkkkkkkkkkkkkkkk',
    ]),
  );
}

function menuBoardSmall() {
  return idle(
    map([
      'kkkkkkkkkk',
      'kcccccccck',
      'kcyyycwwck',
      'kcccccccck',
      'kcrrcwwwck',
      'kcccccccck',
      'kceeecwwck',
      'kkkkkkkkkk',
    ]),
  );
}

// A poster of a burger.
function promoPoster() {
  return idle(
    map([
      'kkkkkkk',
      'kyyyyyk',
      'kylllyk',
      'klllllk',
      'kLLLLLk',
      'kdddddk',
      'klllllk',
      'kyyyyyk',
      'kkkkkkk',
    ]),
  );
}

// In the middle of the shop.

// The service counter with a register; serving, a bag and a drink wait on it.
function counter() {
  return serving(
    [
      '..ggg.....................',
      '.gwwwg....................',
      '.gkkkg....................',
      '.ggggg....................',
      'llllllllllllllllllllllllll',
      'oooooooooooooooooooooooooo',
      'rrrrrrrrrrrrrrrrrrrrrrrrrr',
      'rwrwrwrwrwrwrwrwrwrwrwrwrw',
      'rrrrrrrrrrrrrrrrrrrrrrrrrr',
      'dddddddddddddddddddddddddd',
    ],
    (canvas) => canvas.drawMap(14, 0, ['.ll....', 'llll.w.', 'lrrl.r.', 'llll.r.'], legend),
  );
}

// A table with a red bench on each side.
function booth() {
  return serving(
    [
      'rr..............rr',
      'rr..............rr',
      'rr..............rr',
      'rr..wwwwwwwwww..rr',
      'rr..oooooooooo..rr',
      'rrrrr...dd...rrrrr',
      'rrrrr...dd...rrrrr',
      'dd......dd......dd',
      'dd......dd......dd',
      'dd.....kkkk.....dd',
    ],
    (canvas) => canvas.drawMap(5, 1, ['.rr..w..', 'rrryyr.w'], legend),
  );
}

// A table with a chair on each side, facing it.
function tableChairs() {
  return serving(
    [
      '................',
      '....wwwwwwww....',
      '....dddddddd....',
      'o......dd......o',
      'o......dd......o',
      'oooo...dd...oooo',
      'd..d...dd...d..d',
      'd..d...dd...d..d',
      'd..d..kkkk..d..d',
    ],
    (canvas) => canvas.drawMap(5, 0, ['rryy.w'], legend),
  );
}

// A tall table with two stools.
function stoolTable() {
  return idle(
    map([
      'ooooooooooo',
      'ddddddddddd',
      '..d.....d..',
      '..d.....d..',
      '..d.....d..',
      '..d.....d..',
      'rrr.....rrr',
      '.s.......s.',
      '.s.......s.',
      'kkk.....kkk',
    ]),
  );
}

export function fastFoodProps() {
  return {
    fryer: fryer(),
    grill: grill(),
    'soda-fountain': sodaFountain(),
    'shake-machine': shakeMachine(),
    warmer: warmer(),
    'drinks-fridge': drinksFridge(),
    'trash-bin': trashBin(),
    'condiment-stand': condimentStand(),
    'plant-medium': idle(plantMedium()),
    'menu-board': menuBoard(),
    'menu-board-small': menuBoardSmall(),
    'promo-poster': promoPoster(),
    clock: idle(clock()),
    counter: counter(),
    booth: booth(),
    'table-chairs': tableChairs(),
    'stool-table': stoolTable(),
  };
}

export const fastFoodGroup = {
  name: 'fast-food',
  draw() {
    return propSprites(
      'fast-food',
      fastFoodProps(),
      [],
      [{ id: 'fast-food/overlay/closed', canvas: closedShopOverlay(16, fastFoodLook) }],
    );
  },
};
