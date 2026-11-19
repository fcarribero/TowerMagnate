import { PixelCanvas } from '../canvas.mjs';
import {
  detergentShelf,
  idle,
  legend,
  map,
  mopBucket,
  sink,
  supplyCabinet,
  timeClock,
} from './housekeeping.mjs';
import { calendar, clock, corkboard, propSprites } from './office.mjs';

// Props of the building's cleaning room, placed by the client on top of the bare room it shares
// with housekeeping (units/housekeeping/empty_day). The cleaning room keeps tools and products;
// it has no washers and no linen, which belong to the hotel's housekeeping. Looks: `idle` with
// the crew out, `busy` with the crew in (some tools taken off the rack).
// The sizes here must match apps/web/src/render/interior/cleaning.ts.

// A rail on the wall with mops, brooms, a dustpan and a squeegee hanging from it.
function toolRack() {
  const draw = (busy) => {
    const canvas = new PixelCanvas(14, 20);
    canvas.hline(0, 0, 14, 'gray');
    canvas.set(0, 1, 'gray');
    canvas.set(13, 1, 'gray');
    if (!busy) {
      // A mop: handle and strands.
      canvas.vline(2, 1, 12, 'wood');
      canvas.drawMap(1, 13, ['CCC', 'CwC', 'CCC', 'wCw', 'C.C'], legend);
    }
    // A broom.
    canvas.vline(5, 1, 11, 'wood');
    canvas.drawMap(4, 12, ['ddd', 'ooo', 'ooo', 'o.o'], legend);
    // A dustpan.
    canvas.vline(8, 1, 4, 'charcoal');
    canvas.drawMap(7, 5, ['sss', 'sss', 'sss', '.s.'], legend);
    if (!busy) {
      // A squeegee.
      canvas.vline(11, 1, 12, 'silver');
      canvas.drawMap(10, 13, ['kkk'], legend);
    }
    // A bucket on the floor below the rail.
    canvas.drawMap(8, 15, ['yyyyy', 'ykkky', 'yyyyy', 'yyyyy', '.yyy.'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// Metal shelving with cleaning products: bottles, jugs and boxes.
function chemicalShelf() {
  return idle(
    map([
      'g............g',
      'g.rr.bb.yy.r.g',
      'g.ww.bb.yy.wwg',
      'gvvvvvvvvvvvvg',
      'g.rw.rw.bbb..g',
      'g.ww.ww.bbb..g',
      'g.ww.ww.bbb..g',
      'gvvvvvvvvvvvvg',
      'g..yyy.yyy...g',
      'g..yyy.yyy.C.g',
      'g..yyy.yyy.C.g',
      'gvvvvvvvvvvvvg',
      'g.ssss.ssss..g',
      'g.CCCC.CCCC..g',
      'g.ssss.ssss..g',
      'gvvvvvvvvvvvvg',
      'g............g',
      'g............g',
    ]),
  );
}

// A drum of floor cleaner.
function drum() {
  return idle(
    map([
      '.bbbbb.',
      'bBBBBBb',
      'bbbbbbb',
      'bbbbbbb',
      'bswwwsb',
      'bswrwsb',
      'bbbbbbb',
      'bbbbbbb',
      'bBBBBBb',
      '.bbbbb.',
    ]),
  );
}

// Boxes of toilet paper and paper towels for the washrooms.
function paperStock() {
  return idle(
    map([
      '.wC.wC.wC.',
      '.wC.wC.wC.',
      'oooooooooo',
      'olllloolll',
      'olllloolll',
      'oooooooooo',
      'olllloolll',
      'olllloolll',
      'oooooooooo',
    ]),
  );
}

function vacuum() {
  return idle(
    map([
      '..cc.',
      '...c.',
      '...c.',
      '...c.',
      '..rrr',
      '..rrr',
      '..rrr',
      '..rrr',
      '..rrr',
      '..rrr',
      '.ccrr',
      'ccccc',
      'k...k',
    ]),
  );
}

// A janitor's cart: spray bottles on top, a trash bag in the frame and a bucket with a mop.
function janitorCart() {
  return idle(
    map([
      '..r.b....o....',
      '.www.ww..o....',
      '.www.ww..o....',
      'gggggggg.o....',
      'g......g.o....',
      'gcccccgyyyyy..',
      'gcccccgyCCCy..',
      'gcccccgyyyyy..',
      'gcccccg.yyy...',
      'gggggggggggggg',
      '.k.........k..',
    ]),
  );
}

function wetFloorSign() {
  return idle(map(['..y..', '.yyy.', '.yky.', '.yky.', '.yyy.', 'yykyy', 'yyyyy', 'y...y']));
}

// A walk-behind floor scrubber.
function floorScrubber() {
  return idle(
    map([
      '.........cc.',
      '.........c..',
      '........c...',
      '.......c....',
      '..bbbbbc....',
      '.bbbbbbbb...',
      'gggggggggg..',
      'gsssssssssg.',
      'gggggggggggg',
      '.kkk....k...',
    ]),
  );
}

export function cleaningProps() {
  return {
    'tool-rack': toolRack(),
    'chemical-shelf': chemicalShelf(),
    'supply-cabinet': supplyCabinet(),
    drum: drum(),
    'paper-stock': paperStock(),
    vacuum: vacuum(),
    sink: sink(),
    'janitor-cart': janitorCart(),
    'mop-bucket': mopBucket(),
    'wet-floor-sign': wetFloorSign(),
    'floor-scrubber': floorScrubber(),
    'time-clock': timeClock(),
    'detergent-shelf': detergentShelf(),
    corkboard: idle(corkboard()),
    calendar: idle(calendar()),
    clock: idle(clock()),
  };
}

export const cleaningGroup = {
  name: 'cleaning',
  draw() {
    return propSprites('cleaning', cleaningProps(), [[12, 7]]);
  },
};
