import { PixelCanvas } from '../canvas.mjs';

// Office props that the client places on top of the bare office room (units/office/empty_day).
// Each prop is drawn once by day; night is a shade the client lays over the room, so there
// is no night version. A prop that changes when the office is occupied (screens on) also has a `busy` sprite. Every sprite rests on its bottom row, except wall
// props, which hang. The sizes here must match OFFICE_CATALOG in apps/web/src/render/officeCatalog.ts.

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
  S: 'sky-light',
  B: 'sky',
  y: 'lamp',
  Y: 'lamp-glow',
  G: 'glass',
  u: 'dusk',
};

export function map(rows) {
  const canvas = new PixelCanvas(rows[0].length, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

export function blank(width, height) {
  return new PixelCanvas(width, height);
}

// Office chair seen from behind, standing in front of the desk: backrest, post and a wheeled base.
const deskChair = ['.ssss.', 'sggggs', 'sggggs', '.ssss.', '..cc..', '.cccc.', 'c....c'];

// A 16-wide desk, 7 rows: top, front and two legs. `look` picks the material.
const deskRows = [
  'llllllllllllllll',
  'oooooooooooooooo',
  'd.dddddddddddd.d',
  'd.d..........d.d',
  'd.d..........d.d',
  'd.d..........d.d',
  'd.dddddddddddd.d',
];
const METAL = { 'wood-light': 'silver', wood: 'gray', 'wood-dark': 'slate' };
const WHITE = { 'wood-light': 'white', wood: 'cloud', 'wood-dark': 'silver' };

// A workstation is a desk with its screen and its chair, 16 wide and 13 tall. The chair stands
// in front of the desk, under the screen, at column `chairLeft`.
function workstation({ material, top, screens, busyExtras, chairLeft }) {
  const draw = (busy) => {
    const canvas = blank(16, 13);
    let desk = map(deskRows);
    if (material) desk = desk.recolor(material);
    canvas.stamp(desk, 0, 6);
    top(canvas, busy);
    if (busy) {
      for (const [x, y, w, h] of screens) {
        canvas.fillRect(x, y, w, h, 'sky-light');
        canvas.hline(x, y + Math.floor(h / 2), Math.max(1, w - 1), 'white');
      }
      busyExtras?.(canvas);
    }
    canvas.drawMap(chairLeft, 6, deskChair, legend);
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function monitorTop(canvas) {
  canvas.drawMap(4, 0, ['cccccc', 'cssssc', 'cssssc', 'cssssc', 'cccccc', '..cc..'], legend);
}

function dualMonitorTop(canvas) {
  canvas.drawMap(
    1,
    1,
    ['ccccc.ccccc', 'csssc.csssc', 'csssc.csssc', 'ccccc.ccccc', '..c.....c..'],
    legend,
  );
}

function laptopTop(canvas) {
  canvas.drawMap(5, 2, ['.ccccc', '.cssc.', '.cssc.', 'ccccccc'], legend);
}

function mug(canvas) {
  canvas.drawMap(11, 4, ['ww.', 'wwr'], legend);
}

function papers(canvas) {
  canvas.drawMap(11, 4, ['CCw', 'wCC'], legend);
}

const workstations = {
  workstation: workstation({
    top: monitorTop,
    screens: [[5, 1, 4, 3]],
    busyExtras: mug,
    chairLeft: 4,
  }),
  'workstation-metal': workstation({
    material: METAL,
    top: monitorTop,
    screens: [[5, 1, 4, 3]],
    busyExtras: papers,
    chairLeft: 4,
  }),
  'workstation-dual': workstation({
    material: WHITE,
    top: dualMonitorTop,
    screens: [
      [2, 2, 3, 2],
      [8, 2, 3, 2],
    ],
    busyExtras: (canvas) => canvas.drawMap(13, 4, ['ww', 'wr'], legend),
    chairLeft: 3,
  }),
  'workstation-laptop': workstation({
    top: laptopTop,
    screens: [[7, 3, 2, 2]],
    busyExtras: mug,
    chairLeft: 5,
  }),
};

// A round-ended meeting table with a chair at each end, 28 wide.
function meetingTable() {
  const draw = (busy) => {
    const canvas = blank(28, 9);
    canvas.drawMap(0, 4, ['s...', 's...', 'ssss', '.c..', 'c.c.'], legend);
    canvas.drawMap(24, 4, ['...s', '...s', 'ssss', '..c.', '.c.c'], legend);
    canvas.hline(4, 3, 20, 'wood-light');
    canvas.hline(3, 4, 22, 'wood');
    canvas.hline(4, 5, 20, 'wood-dark');
    canvas.vline(13, 6, 3, 'wood-dark');
    canvas.vline(14, 6, 3, 'charcoal');
    canvas.hline(10, 8, 8, 'charcoal');
    if (busy) {
      canvas.drawMap(6, 0, ['.cccc', '.cSSc', 'cccccc'], legend);
      canvas.drawMap(17, 1, ['CCw', 'wCC'], legend);
      canvas.drawMap(13, 1, ['w.', 'r.'], legend);
    } else {
      canvas.drawMap(12, 2, ['CCwC'], legend);
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function copier() {
  const draw = (busy) => {
    const canvas = map([
      '.CCCCCCCCC..',
      'kvvvvvvvvvvk',
      'kwwwwwwwwwsk',
      'kvvvvvvvvvsk',
      'kvggggggvvsk',
      'kvvvvvvvvvsk',
      'kvsvsvvvvvsk',
      'kvvvvvvvvvsk',
      'kggggggggggk',
      'kvvvvvvvvvsk',
      'kvvgggvvvvsk',
      'kvvvvvvvvvsk',
      'kkkkkkkkkkkk',
    ]);
    if (busy) {
      canvas.set(9, 4, 'leaf');
      canvas.hline(2, 2, 6, 'cloud');
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

export function plantMedium() {
  return map([
    '.L..L..',
    'LDL.LD.',
    '.LDLDL.',
    'L.LDL.L',
    '.DLLDL.',
    '..LDL..',
    '...D...',
    '.kkkkk.',
    '.kbbbk.',
    '.kbbbk.',
    '..kbk..',
    '..kkk..',
  ]);
}

// A cubicle partition: a fabric panel on a metal foot.
function partition() {
  return map([
    'gvg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gbg',
    'gvg',
    '.s.',
    'sss',
  ]);
}

// Props that stand against the back wall.

function filingCabinet(drawers) {
  const rows = ['vvvvvv'];
  for (let i = 0; i < drawers; i++) {
    rows.push('vggggs', 'vgkkgs', 'vggggs', 'vsssss');
  }
  rows.pop();
  rows.push('ssssss');
  return map(rows);
}

export function bookshelf() {
  const canvas = blank(12, 19);
  canvas.fillRect(0, 0, 12, 19, 'wood');
  canvas.strokeRect(0, 0, 12, 19, 'wood-dark');
  canvas.hline(1, 1, 10, 'wood-light');
  const shelves = [1, 6, 11];
  const books = [
    'cloth-red',
    'cloth-blue',
    'cloud',
    'leaf-dark',
    'wood-dark',
    'cloth-blue',
    'slate',
  ];
  shelves.forEach((top, shelf) => {
    canvas.fillRect(1, top + 1, 10, 4, 'wood-dark');
    let x = 1;
    let i = shelf * 2;
    while (x < 11) {
      const width = 1 + ((i + shelf) % 2);
      const height = 3 + ((i * 3 + shelf) % 2);
      if (!(shelf === 1 && x >= 7 && x <= 8)) {
        canvas.fillRect(
          x,
          top + 5 - height,
          Math.min(width, 11 - x),
          height,
          books[i % books.length],
        );
      }
      x += width;
      i += 1;
    }
    canvas.hline(1, top + 5, 10, 'wood-light');
  });
  canvas.fillRect(1, 17, 10, 1, 'wood-dark');
  return canvas;
}

function credenza() {
  return map([
    '.........DLD..',
    '.bbr.....LDL..',
    '.bbrC....kok..',
    'llllllllllllll',
    'oooooooooooood',
    'od....oo....dd',
    'od..k.oo.k..dd',
    'od....oo....dd',
    'oddddddddddddd',
    'c............c',
  ]);
}

function waterCooler() {
  return map([
    '.SSSS.',
    'SBBBBS',
    'SBSBBS',
    'SBBBBS',
    '.SSSS.',
    '.wwww.',
    'wwwwwv',
    'wbrwwv',
    'wwwwwv',
    'wvvvvv',
    'wwwwwv',
    'wwwwwv',
    'wwwwwv',
    'vvvvvv',
  ]);
}

function coffeeStation() {
  const draw = (busy) => {
    const canvas = map([
      '.cccc.......',
      '.cssc..w.w..',
      '.cyyc..w.w..',
      '.c..c.......',
      '.cccc.......',
      'llllllllllll',
      'oooooooooooo',
      'od...od...od',
      'od.k.od.k.od',
      'od...od...od',
      'oddddoddddod',
      'c..........c',
    ]);
    if (busy) {
      canvas.set(2, 3, 'wood-dark');
      canvas.set(3, 3, 'wood-dark');
      canvas.set(2, 2, 'lamp-glow');
      canvas.set(3, 2, 'lamp-glow');
    } else {
      canvas.set(2, 2, 'slate');
      canvas.set(3, 2, 'slate');
    }
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

export function plantTall() {
  return map([
    '...L.L..',
    '..LDLDL.',
    '.LDLLDL.',
    'LDLDLLDL',
    '.LLDLDL.',
    'LDL.DLDL',
    '.L.LD.L.',
    '...LD...',
    '..L.DL..',
    '....D...',
    '....D...',
    '.kkkkkk.',
    '.kccccck',
    '..kcccck',
    '..kcccck',
    '..kccck.',
    '..kkkkk.',
  ]);
}

function plantSmall() {
  return map(['.L.L.', 'LDLDL', '.LDL.', '..D..', 'kooo.', '.ood.', '.ood.', '.kkk.']);
}

function trashBin() {
  return map(['gsssg', 'g.C.g', 'gsssg', 'gsssg', '.ggg.']);
}

function coatRack() {
  return map([
    '..k...',
    'kkkkk.',
    'b.k.k.',
    'bbk.r.',
    'bbk.r.',
    'b.k.r.',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '..k...',
    '.kkk..',
    'k.k.k.',
  ]);
}

function sofa() {
  const width = 18;
  const canvas = blank(width, 9);
  canvas.fillRect(1, 0, width - 2, 5, 'cloth-blue');
  canvas.hline(2, 1, width - 4, 'sky');
  canvas.fillRect(0, 3, width, 4, 'cloth-blue');
  canvas.hline(1, 4, width - 2, 'sky');
  canvas.strokeRect(0, 3, 3, 4, 'ink');
  canvas.strokeRect(width - 3, 3, 3, 4, 'ink');
  canvas.hline(1, 0, width - 2, 'ink');
  canvas.vline(1, 0, 3, 'ink');
  canvas.vline(width - 2, 0, 3, 'ink');
  canvas.vline(9, 4, 3, 'ink');
  canvas.hline(0, 6, width, 'ink');
  canvas.vline(1, 7, 2, 'wood-dark');
  canvas.vline(width - 2, 7, 2, 'wood-dark');
  return canvas;
}

function locker() {
  return map(
    [
      'vvvvvvvv',
      'vgggsgggs',
      'vgkgsgkgs',
      'vgkgsgkgs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vgvgsgvgs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vgggsgggs',
      'vsssssss',
      'ssssssss',
    ].map((row) => row.slice(0, 8)),
  );
}

function safe() {
  return map([
    'kkkkkkkk',
    'kssssssk',
    'ksggggck',
    'ksgvvgck',
    'ksgvkgck',
    'ksggggck',
    'kccccccc',
    'kkkkkkkk',
  ]);
}

function vendingMachine() {
  const draw = (busy) => {
    const canvas = blank(10, 20);
    canvas.fillRect(0, 0, 10, 20, 'cloth-red');
    canvas.strokeRect(0, 0, 10, 20, 'ink');
    canvas.fillRect(1, 2, 6, 12, busy ? 'sky-light' : 'glass');
    const cans = ['cloth-blue', 'lamp', 'leaf', 'white'];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        canvas.set(2 + col * 2, 3 + row * 3, cans[(row + col) % cans.length]);
      }
      canvas.hline(1, 4 + row * 3, 6, 'gray');
    }
    canvas.fillRect(8, 3, 1, 6, 'charcoal');
    canvas.set(8, 4, busy ? 'lamp-glow' : 'slate');
    canvas.fillRect(2, 16, 5, 2, 'charcoal');
    canvas.hline(1, 1, 8, 'white');
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

// Props that hang on the back wall.

export function clock() {
  return map(['.kkkk.', 'kwwkwk', 'kwwkwk', 'kwwrrk', 'kwwwwk', '.kkkk.']);
}

function frame(width, height, scene) {
  const canvas = blank(width, height);
  canvas.strokeRect(0, 0, width, height, 'ink');
  canvas.fillRect(1, 1, width - 2, height - 2, 'cloud');
  scene(canvas, width - 2, height - 2);
  return canvas;
}

export function pictureSmall() {
  return frame(8, 6, (canvas) => {
    canvas.fillRect(1, 1, 6, 2, 'sky-light');
    canvas.fillRect(1, 3, 6, 2, 'leaf');
    canvas.set(5, 1, 'lamp');
  });
}

export function pictureWide() {
  return frame(14, 8, (canvas) => {
    canvas.fillRect(1, 1, 12, 6, 'dusk');
    canvas.fillRect(1, 4, 12, 3, 'sky-deep');
    canvas.drawMap(3, 2, ['.kk...k', 'kkkk.kkk'], legend);
    canvas.set(10, 1, 'lamp');
  });
}

function whiteboard() {
  const canvas = blank(18, 10);
  canvas.fillRect(0, 0, 18, 9, 'silver');
  canvas.fillRect(1, 1, 16, 7, 'white');
  canvas.drawMap(2, 2, ['bbbb..rr', '.......r', 'bb.bbb.r', '.....rrr'], legend);
  canvas.drawMap(11, 2, ['.b..', 'bbb.', '.b.b', '....'], legend);
  canvas.hline(2, 9, 14, 'gray');
  canvas.set(4, 8, 'cloth-red');
  canvas.set(6, 8, 'cloth-blue');
  return canvas;
}

function corkboard() {
  const canvas = blank(12, 8);
  canvas.fillRect(0, 0, 12, 8, 'wood-dark');
  canvas.fillRect(1, 1, 10, 6, 'wood-light');
  canvas.fillRect(2, 2, 3, 3, 'white');
  canvas.fillRect(6, 1, 3, 2, 'lamp');
  canvas.fillRect(7, 4, 3, 2, 'sky-light');
  canvas.set(3, 2, 'cloth-red');
  canvas.set(7, 1, 'cloth-blue');
  return canvas;
}

export function wallShelf() {
  return map(['.rb.CC.L.', '.rbbCC.LD', '.rbbCCkkk', 'lllllllll', 'd.......d']);
}

function certificate() {
  return frame(5, 6, (canvas) => {
    canvas.hline(1, 2, 3, 'slate');
    canvas.hline(1, 3, 2, 'slate');
    canvas.set(3, 4, 'lamp');
  });
}

function calendar() {
  return map(['.k.k.', 'rrrrr', 'wwwww', 'wkwkw', 'wwwww', 'wkwrw', 'wwwww']);
}

function wallScreen() {
  const draw = (busy) => {
    const canvas = blank(16, 10);
    canvas.fillRect(0, 0, 16, 9, 'ink');
    canvas.fillRect(1, 1, 14, 7, busy ? 'sky-light' : 'charcoal');
    if (busy) {
      canvas.fillRect(3, 5, 2, 2, 'cloth-blue');
      canvas.fillRect(6, 3, 2, 4, 'leaf');
      canvas.fillRect(9, 4, 2, 3, 'cloth-red');
      canvas.fillRect(12, 2, 2, 5, 'lamp');
    }
    canvas.hline(7, 9, 2, 'slate');
    return canvas;
  };
  return { idle: draw(false), busy: draw(true) };
}

function single(canvas) {
  return { idle: canvas };
}

export function officeProps() {
  return {
    ...workstations,
    'meeting-table': meetingTable(),
    copier: copier(),
    'plant-medium': single(plantMedium()),
    partition: single(partition()),
    'filing-cabinet': single(filingCabinet(3)),
    'filing-cabinet-low': single(filingCabinet(2)),
    bookshelf: single(bookshelf()),
    credenza: single(credenza()),
    'water-cooler': single(waterCooler()),
    'coffee-station': coffeeStation(),
    'plant-tall': single(plantTall()),
    'plant-small': single(plantSmall()),
    'trash-bin': single(trashBin()),
    'coat-rack': single(coatRack()),
    sofa: single(sofa()),
    locker: single(locker()),
    safe: single(safe()),
    'vending-machine': vendingMachine(),
    clock: single(clock()),
    'picture-small': single(pictureSmall()),
    'picture-wide': single(pictureWide()),
    whiteboard: single(whiteboard()),
    corkboard: single(corkboard()),
    'wall-shelf': single(wallShelf()),
    certificate: single(certificate()),
    calendar: single(calendar()),
    'wall-screen': wallScreen(),
  };
}

// Curtains over an office window (14x8 glass), drawn by the client on top of the room.
export function curtainsClosed() {
  const canvas = blank(14, 8);
  canvas.fillRect(0, 0, 14, 8, 'cloud');
  for (let x = 2; x < 14; x += 3) canvas.vline(x, 1, 7, 'silver');
  canvas.hline(0, 0, 14, 'gray');
  canvas.hline(0, 7, 14, 'silver');
  return canvas;
}

export function curtainsOpen() {
  const canvas = blank(14, 8);
  for (const x of [0, 11]) {
    canvas.fillRect(x, 1, 3, 7, 'cloud');
    canvas.vline(x + 1, 1, 7, 'silver');
    canvas.hline(x, 7, 3, 'silver');
  }
  canvas.hline(0, 0, 14, 'gray');
  return canvas;
}

// The sprites of a set of props: `<group>/<kind>/<look>` for every look a prop has (idle, plus
// busy or sleep when it changes), and the window curtains, closed and open.
export function propSprites(group, props) {
  const sprites = [];
  for (const [kind, looks] of Object.entries(props)) {
    for (const [look, canvas] of Object.entries(looks)) {
      sprites.push({ id: `${group}/${kind}/${look}`, canvas });
    }
  }
  sprites.push({ id: `${group}/curtains/closed`, canvas: curtainsClosed() });
  sprites.push({ id: `${group}/curtains/open`, canvas: curtainsOpen() });
  return sprites;
}

export const officeGroup = {
  name: 'office',
  draw() {
    return propSprites('office', officeProps());
  },
};
