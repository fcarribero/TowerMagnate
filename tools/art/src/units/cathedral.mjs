import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';

const WIDTH_TILES = 28;
const FLOORS = 4;
const WIDTH = WIDTH_TILES * metrics.tileWidth;
const HEIGHT = FLOORS * metrics.floorHeight;
const SLAB_TOP = HEIGHT - metrics.slabHeight;
const FLOOR_ROW = SLAB_TOP - 1;
const FLOOR_TOP = FLOOR_ROW - 2;

const TOWER = { left: 4, width: 36, spireApex: 8, belfryTop: 34, belfryBottom: 58 };
const NAVE_LEFT = TOWER.left + TOWER.width;
const NAVE_RIGHT = WIDTH - 1;
const ROOF = {
  apexX: Math.floor((NAVE_LEFT + NAVE_RIGHT) / 2),
  apexY: 14,
  eaveY: 40,
  thickness: 5,
};
const ROSE = { x: ROOF.apexX, y: 36, radius: 7 };
const LANCET_TOP = 54;
const LANCET_BOTTOM = 100;
const LANCET_WIDTH = 12;
const LANCET_LEFTS = [62, 108, 154];
const PILLAR_XS = [52, 98, 144, 182];
const PEW_LEFTS = [56, 76, 96, 116, 136, 156];
const ALTAR_LEFT = 190;

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
};

const pew = [
  'do..............',
  'dl..............',
  'dl..............',
  'dl..............',
  'dllllllllllllll.',
  'doooooooooooooo.',
  'd.d..........d..',
  'd.d..........d..',
];

const altar = [
  '....wwwwwwwwwwwwwwwwww....',
  '....CwwwwwwwwwwwwwwwwC....',
  '....oCCrrrrrrrrrrrrCCo....',
  '....oooorrrrrrrrrroooo....',
  '....ooooooooooooooooool...',
  '....od..............do....',
  '....od..............do....',
  '..vvvvvvvvvvvvvvvvvvvvvv..',
  '..gggggggggggggggggggggg..',
  'vvvvvvvvvvvvvvvvvvvvvvvvvv',
  'gggggggggggggggggggggggggg',
];

const candle = ['Y', 'y', 'w', 'w', 'w', 'v'];

const altarCross = [
  '..yy..',
  '..yy..',
  'yyyyyy',
  'yyyyyy',
  '..yy..',
  '..yy..',
  '..yy..',
  '..yy..',
  '..oo..',
];

const bell = [
  '...yy...',
  '..yyyy..',
  '..yyyo..',
  '.yyyyoo.',
  '.yyyyoo.',
  'yyyyyooo',
  'oooooooo',
  '...dd...',
];

const chandelier = ['...c...', 'Y.YcY.Y', 'y.yyy.y', 'ccccccc', '.ccccc.'];

const towerDoor = [
  '...dddd...',
  '.ddoooodd.',
  'dooolooood',
  'doolloolod',
  'doolloolod',
  'doolloolod',
  'doolloolod',
  'doolloolod',
  'doolloolyd',
  'doolloolod',
  'doolloolod',
  'doolloolod',
  'doolloolod',
  'doolloolod',
];

const flowerStand = [
  '.wLw.',
  'LwywL',
  'wLwLw',
  '.LDL.',
  '..D..',
  '..v..',
  '..v..',
  '..v..',
  '.vvv.',
];

const pewBow = ['w.w', '.r.', 'w.w'];

const wreath = ['.LLL.', 'LwLwL', 'L...L', 'LwLwL', '.LrL.'];

const stainedColors = ['cloth-blue', 'cloth-red', 'lamp', 'cloth-blue', 'leaf', 'cloth-red'];

function roofLineAt(x) {
  const halfSpan = ROOF.apexX - NAVE_LEFT;
  const distance = Math.abs(x - ROOF.apexX);
  return ROOF.apexY + Math.round(((ROOF.eaveY - ROOF.apexY) * distance) / halfSpan);
}

function drawNaveShell(canvas) {
  for (let x = NAVE_LEFT; x <= NAVE_RIGHT; x++) {
    const roofTop = roofLineAt(x);
    const ceiling = roofTop + ROOF.thickness;
    canvas.fillRect(x, ceiling, 1, FLOOR_TOP - ceiling, 'cloud');
    for (let y = ceiling; y < FLOOR_TOP; y++) {
      const isMortarRow = y % 8 === 0;
      const isMortarJoint = y % 8 < 4 ? x % 16 === 0 : x % 16 === 8;
      if (isMortarRow || isMortarJoint) {
        canvas.set(x, y, 'concrete-light');
      }
    }
    canvas.fillRect(x, roofTop, 1, ROOF.thickness, 'slate');
    canvas.set(x, roofTop + 1, x < ROOF.apexX ? 'gray' : 'slate');
    canvas.set(x, roofTop + ROOF.thickness - 1, 'charcoal');
    canvas.set(x, roofTop, 'ink');
  }
  for (const [color, row] of [
    ['concrete-light', 0],
    ['concrete', 1],
    ['concrete-dark', 2],
  ]) {
    canvas.hline(NAVE_LEFT, FLOOR_TOP + row, NAVE_RIGHT - NAVE_LEFT + 1, color);
  }
  canvas.vline(NAVE_RIGHT, roofLineAt(NAVE_RIGHT), FLOOR_ROW - roofLineAt(NAVE_RIGHT) + 1, 'ink');
  canvas.vline(
    NAVE_RIGHT - 1,
    roofLineAt(NAVE_RIGHT) + ROOF.thickness,
    FLOOR_TOP - roofLineAt(NAVE_RIGHT) - ROOF.thickness,
    'concrete',
  );
}

function drawPillar(canvas, x) {
  const top = roofLineAt(x) + ROOF.thickness;
  canvas.fillRect(x - 2, top, 5, FLOOR_TOP - top, 'concrete-light');
  canvas.vline(x - 2, top, FLOOR_TOP - top, 'white');
  canvas.vline(x + 2, top, FLOOR_TOP - top, 'concrete');
  canvas.fillRect(x - 3, FLOOR_TOP - 3, 7, 3, 'concrete');
  canvas.hline(x - 3, FLOOR_TOP - 3, 7, 'concrete-light');
}

// Pointed arch: full width below the arch, narrowing two pixels per row above it.
function lancetRows(left) {
  const rows = [];
  const archRows = Math.floor(LANCET_WIDTH / 2);
  for (let y = LANCET_TOP; y <= LANCET_BOTTOM; y++) {
    const inset = Math.max(0, archRows - (y - LANCET_TOP));
    rows.push({ y, from: left + inset, to: left + LANCET_WIDTH - 1 - inset });
  }
  return rows;
}

function stainedColorAt(x, y) {
  const diamond = Math.floor((x + y) / 4) + Math.floor((x - y + 64) / 4);
  return stainedColors[diamond % stainedColors.length];
}

function drawLancet(canvas, left, lit) {
  const rows = lancetRows(left);
  for (const { y, from, to } of rows) {
    canvas.set(from - 1, y, 'silver');
    canvas.set(to + 1, y, 'silver');
    for (let x = from; x <= to; x++) {
      canvas.set(x, y, lit ? stainedColorAt(x, y) : 'night-deep');
    }
  }
  canvas.set(left + LANCET_WIDTH / 2 - 1, LANCET_TOP - 1, 'silver');
  canvas.set(left + LANCET_WIDTH / 2, LANCET_TOP - 1, 'silver');
  canvas.hline(left - 1, LANCET_BOTTOM + 1, LANCET_WIDTH + 2, 'silver');
  for (let y = LANCET_TOP + 10; y < LANCET_BOTTOM; y += 12) {
    canvas.hline(left, y, LANCET_WIDTH, 'charcoal');
  }
  canvas.vline(left + LANCET_WIDTH / 2, LANCET_TOP + 6, LANCET_BOTTOM - LANCET_TOP - 5, 'charcoal');
}

function drawRoseWindow(canvas, lit) {
  const { x: cx, y: cy, radius } = ROSE;
  for (let y = cy - radius - 1; y <= cy + radius + 1; y++) {
    for (let x = cx - radius - 1; x <= cx + radius + 1; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius + 0.5 && distance <= radius + 1.5) {
        canvas.set(x, y, 'silver');
      } else if (distance <= radius + 0.5) {
        const isSpoke = x === cx || y === cy || Math.abs(x - cx) === Math.abs(y - cy);
        if (isSpoke || distance < 1.5) {
          canvas.set(x, y, 'charcoal');
        } else if (!lit) {
          canvas.set(x, y, 'night-deep');
        } else {
          canvas.set(x, y, distance < radius / 2 ? 'lamp' : stainedColorAt(x, y));
        }
      }
    }
  }
}

function drawTower(canvas, swingingBell) {
  const { left, width, spireApex, belfryTop, belfryBottom } = TOWER;
  const centre = left + width / 2;

  canvas.drawMap(
    centre - 3,
    0,
    ['..yy..', 'yyyyyy', '..yy..', '..yy..', '..yy..', '..yy..', '..yy..', '..yy..'],
    legend,
  );
  const spireRows = belfryTop - spireApex;
  for (let row = 0; row < spireRows; row++) {
    const half = Math.round(((row + 1) * (width / 2)) / spireRows);
    const y = spireApex + row;
    canvas.hline(centre - half, y, half * 2, 'slate');
    canvas.set(centre - half, y, 'ink');
    canvas.set(centre - half + 1, y, 'silver');
    canvas.set(centre + half - 1, y, 'ink');
    if (row % 4 === 3) {
      canvas.hline(centre - half + 2, y, half * 2 - 3, 'gray');
    }
  }

  canvas.fillRect(left, belfryTop, width, FLOOR_TOP - belfryTop, 'concrete-light');
  for (let y = belfryTop + 6; y < FLOOR_TOP; y += 6) {
    const offset = (y / 6) % 2 === 0 ? 0 : 4;
    canvas.hline(left + 1, y, width - 2, 'concrete');
    for (let x = left + offset + 2; x < left + width - 1; x += 8) {
      canvas.set(x, y + 1, 'concrete');
      canvas.set(x, y + 2, 'concrete');
    }
  }
  canvas.vline(left + 1, belfryTop, FLOOR_TOP - belfryTop, 'white');
  canvas.vline(left + width - 2, belfryTop, FLOOR_TOP - belfryTop, 'concrete');
  canvas.hline(left, belfryTop, width, 'ink');
  canvas.vline(left, belfryTop, FLOOR_ROW - belfryTop + 1, 'ink');
  canvas.vline(left + width - 1, belfryTop, FLOOR_TOP - belfryTop, 'concrete-dark');

  const opening = {
    left: left + 8,
    top: belfryTop + 6,
    width: width - 16,
    height: belfryBottom - belfryTop - 10,
  };
  canvas.fillRect(opening.left, opening.top, opening.width, opening.height, 'charcoal');
  canvas.hline(opening.left + 2, opening.top - 1, opening.width - 4, 'charcoal');
  canvas.hline(opening.left, opening.top + opening.height, opening.width, 'concrete-dark');
  canvas.hline(centre - 6, opening.top + 1, 12, 'wood-dark');
  if (swingingBell) {
    canvas.drawMap(centre - 2, opening.top + 2, ['.dd.', '.d..'], legend);
    canvas.drawMap(centre - 6, opening.top + 4, bell, legend);
    canvas.drawMap(centre + 3, opening.top + 3, ['w.', 'r.', '.w'], legend);
  } else {
    canvas.vline(centre - 1, opening.top + 2, 2, 'wood-dark');
    canvas.drawMap(centre - 4, opening.top + 4, bell, legend);
  }

  for (const slitTop of [belfryBottom + 6, belfryBottom + 26]) {
    canvas.fillRect(centre - 1, slitTop, 2, 8, 'night-deep');
    canvas.vline(centre - 2, slitTop, 8, 'concrete');
  }
  canvas.drawMap(centre - 5, FLOOR_TOP - towerDoor.length, towerDoor, legend);
  for (const [color, row] of [
    ['concrete-light', 0],
    ['concrete', 1],
    ['concrete-dark', 2],
  ]) {
    canvas.hline(left, FLOOR_TOP + row, width, color);
  }
}

function drawAltar(canvas) {
  const top = FLOOR_TOP - altar.length;
  canvas.drawMap(ALTAR_LEFT, top, altar, legend);
  canvas.drawMap(ALTAR_LEFT + 10, top - 30, altarCross, legend);
  for (const x of [ALTAR_LEFT + 6, ALTAR_LEFT + 19]) {
    canvas.drawMap(x, top - candle.length, candle, legend);
  }
}

function drawPews(canvas) {
  for (const left of PEW_LEFTS) {
    canvas.drawMap(left, FLOOR_TOP - pew.length, pew, legend);
  }
}

function drawChandeliers(canvas) {
  for (const x of [86, 176]) {
    const top = roofLineAt(x) + ROOF.thickness;
    const drop = 60 - top;
    canvas.vline(x, top, drop, 'charcoal');
    canvas.drawMap(x - 3, top + drop, chandelier, legend);
  }
}

function drawWeddingDecoration(canvas) {
  canvas.hline(NAVE_LEFT + 2, FLOOR_TOP, ALTAR_LEFT - NAVE_LEFT, 'cloth-red');
  canvas.hline(NAVE_LEFT + 2, FLOOR_TOP + 1, ALTAR_LEFT - NAVE_LEFT, 'cloth-red');
  for (const left of PEW_LEFTS) {
    canvas.drawMap(left - 1, FLOOR_TOP - pew.length - 2, pewBow, legend);
  }
  for (const x of [ALTAR_LEFT - 4, WIDTH - 8]) {
    canvas.drawMap(x, FLOOR_TOP - flowerStand.length, flowerStand, legend);
  }
  for (let x = NAVE_LEFT + 4; x < NAVE_RIGHT - 4; x++) {
    const sag = Math.round(3 * Math.sin((Math.PI * ((x - NAVE_LEFT - 4) % 23)) / 23));
    canvas.set(x, LANCET_TOP - 8 + sag, 'white');
    if ((x - NAVE_LEFT - 4) % 23 === 0) {
      canvas.drawMap(x - 1, LANCET_TOP - 9, ['LwL', '.L.'], legend);
    }
  }
  const centre = TOWER.left + TOWER.width / 2;
  canvas.drawMap(centre - 2, FLOOR_TOP - 22, wreath, legend);
}

function drawCathedral(wedding, lit) {
  const canvas = new PixelCanvas(WIDTH, HEIGHT);
  drawNaveShell(canvas);
  PILLAR_XS.forEach((x) => drawPillar(canvas, x));
  LANCET_LEFTS.forEach((left) => drawLancet(canvas, left, lit));
  drawRoseWindow(canvas, lit);
  drawChandeliers(canvas);
  drawPews(canvas);
  drawAltar(canvas);
  drawTower(canvas, wedding);
  if (wedding) {
    drawWeddingDecoration(canvas);
  }
  for (const [color, row] of [
    ['concrete-light', 0],
    ['concrete', 1],
    ['concrete-dark', 2],
  ]) {
    canvas.hline(TOWER.left, SLAB_TOP + row, WIDTH - TOWER.left, color);
  }
  return canvas;
}

// Stained glass is only drawn in color while light comes through it: by day from
// outside, and at night only during a wedding, when the nave is lit.
function nightCathedral(wedding) {
  return toNight(drawCathedral(wedding, wedding));
}

export const CATHEDRAL_STATES = ['empty', 'wedding'];

export function cathedralSprites() {
  const sprites = [];
  for (const state of CATHEDRAL_STATES) {
    const wedding = state === 'wedding';
    sprites.push({ id: `units/cathedral/${state}_day`, canvas: drawCathedral(wedding, true) });
    sprites.push({ id: `units/cathedral/${state}_night`, canvas: nightCathedral(wedding) });
  }
  return sprites;
}
