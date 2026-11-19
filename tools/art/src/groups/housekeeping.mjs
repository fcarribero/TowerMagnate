import { PixelCanvas } from '../canvas.mjs';
import { calendar, clock, corkboard, legend as officeLegend, propSprites } from './office.mjs';

// Housekeeping props, placed by the client on top of the bare room
// (units/housekeeping/empty_day). Looks: `idle` with nobody on shift, `busy` with the crew in
// (machines running). The maids are props too, hidden while the room is closed.
// The sizes here must match apps/web/src/render/interior/housekeeping.ts.

const legend = {
  ...officeLegend,
  n: 'night',
  y: 'lamp',
  1: 'skin-light',
  2: 'skin-mid',
  3: 'skin-dark',
};

function map(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = new PixelCanvas(width, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function idle(canvas) {
  return { idle: canvas };
}

function linenShelf() {
  return idle(
    map([
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
    ]),
  );
}

// A front-loading machine; running, its light is on and the drum is full of suds.
function machine(body, shade) {
  const draw = (running) => {
    const canvas = map([
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
    ]).recolor({ white: body, silver: shade });
    canvas.set(8, 1, running ? 'lamp' : 'slate');
    if (running) {
      canvas.drawMap(3, 4, ['.CC.', 'CwCC', 'CCwC'], legend);
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function sink() {
  return idle(
    map([
      'vvvvvvvv',
      'gvvvvvvg',
      '.gvvvvg.',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '..gggg..',
    ]),
  );
}

function supplyCabinet() {
  const canvas = new PixelCanvas(12, 20);
  canvas.fillRect(0, 0, 12, 20, 'gray');
  canvas.strokeRect(0, 0, 12, 20, 'slate');
  canvas.vline(6, 1, 18, 'slate');
  canvas.hline(1, 1, 10, 'silver');
  canvas.set(4, 9, 'silver');
  canvas.set(8, 9, 'silver');
  canvas.drawMap(2, 3, ['b.', 'bw'], legend);
  return idle(canvas);
}

function cart() {
  return idle(
    map([
      '.wwCww....',
      'bbbbbbb..g',
      'bbbbbbb..g',
      'bbbbbbbggg',
      'bbbbbbb..g',
      'gggggggggg',
      'g........g',
      'k........k',
    ]),
  );
}

function laundryBasket() {
  return idle(map(['.wCw.w.', 'ooooooo', 'olololo', 'ooooooo', 'olololo', '.ooooo.']));
}

function ironingBoard() {
  const draw = (busy) => {
    const canvas = map([
      '..............',
      '..............',
      '..............',
      '.vvvvvvvvvvvv.',
      'vvvvvvvvvvvvvv',
      '....g....g....',
      '.....g..g.....',
      '......gg......',
      '.....g..g.....',
      '....g....g....',
    ]);
    if (busy) canvas.drawMap(4, 0, ['.C.C', 'C.C.', 'ggg.'], legend);
    else canvas.drawMap(10, 2, ['gg'], legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function foldingTable() {
  return idle(
    map([
      '.wwww...bbb.....',
      '.CCCC...bbb..ww.',
      'llllllllllllllll',
      'oooooooooooooooo',
      '.d............d.',
      '.d............d.',
      '.d............d.',
      '.d............d.',
    ]),
  );
}

function mopBucket() {
  return idle(
    map([
      '....o..',
      '....o..',
      '....o..',
      '....o..',
      '...o...',
      '.ggggg.',
      '.gbbbg.',
      '.ggggg.',
      'k.....k',
    ]),
  );
}

// A maid in the cloud dress and cloth-blue apron of the style guide.
function maid(skin) {
  return idle(
    map([
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
    ]),
  );
}

function timeClock() {
  return idle(map(['ggggg', 'gwwwg', 'gwkwg', 'ggggg', '.vvv.']));
}

function detergentShelf() {
  return idle(map(['.bb.ww.lL..', '.bb.ww.ll.b', '.bbbwwkllbb', 'ooooooooooo', 'd.........d']));
}

export function housekeepingProps() {
  return {
    'linen-shelf': linenShelf(),
    washer: machine('white', 'silver'),
    dryer: machine('cloud', 'gray'),
    sink: sink(),
    'supply-cabinet': supplyCabinet(),
    cart: cart(),
    'laundry-basket': laundryBasket(),
    'ironing-board': ironingBoard(),
    'folding-table': foldingTable(),
    'mop-bucket': mopBucket(),
    'maid-light': maid('1'),
    'maid-mid': maid('2'),
    'maid-dark': maid('3'),
    'time-clock': timeClock(),
    'detergent-shelf': detergentShelf(),
    corkboard: idle(corkboard()),
    calendar: idle(calendar()),
    clock: idle(clock()),
  };
}

export const housekeepingGroup = {
  name: 'housekeeping',
  draw() {
    return propSprites('housekeeping', housekeepingProps(), [[12, 7]]);
  },
};
