import { PixelCanvas } from '../canvas.mjs';
import { clock, corkboard, legend as officeLegend, plantMedium, propSprites } from './office.mjs';

// Security office props, placed by the client on top of the bare room
// (units/security/empty_day). Looks: `idle` with nobody on shift, `busy` with the officers in
// (screens on, radios out). Officers walk in as people, never as part of a prop.
// The sizes here must match apps/web/src/render/interior/security.ts.

const legend = { ...officeLegend, n: 'night', e: 'leaf' };

function map(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = new PixelCanvas(width, rows.length);
  canvas.drawMap(0, 0, rows, legend);
  return canvas;
}

function idle(canvas) {
  return { idle: canvas };
}

function looks(draw) {
  return { idle: draw(false), busy: draw(true) };
}

// A screen `width` wide: dark when off, a picture with two scan lines when on.
function screen(canvas, left, top, width, height, on, color) {
  canvas.fillRect(left, top, width, height, 'ink');
  canvas.fillRect(left + 1, top + 1, width - 2, height - 2, on ? color : 'charcoal');
  if (on) {
    canvas.hline(left + 2, top + 2, Math.max(1, width - 6), 'white');
    canvas.hline(left + 3, top + height - 3, Math.max(1, width - 5), 'white');
  }
}

// Three camera screens on a panel.
function monitorWall() {
  return looks((on) => {
    const canvas = new PixelCanvas(32, 12);
    canvas.fillRect(0, 0, 32, 12, 'slate');
    canvas.strokeRect(0, 0, 32, 12, 'ink');
    ['leaf', 'lamp-glow', 'glass'].forEach((color, index) => {
      screen(canvas, 2 + index * 10, 2, 8, 7, on, color);
    });
    return canvas;
  });
}

function monitorPair() {
  return looks((on) => {
    const canvas = new PixelCanvas(18, 9);
    canvas.fillRect(0, 0, 18, 9, 'slate');
    canvas.strokeRect(0, 0, 18, 9, 'ink');
    screen(canvas, 1, 1, 8, 7, on, 'glass');
    screen(canvas, 9, 1, 8, 7, on, 'leaf');
    return canvas;
  });
}

function shield() {
  return idle(
    map([
      'kkkkkkkkk',
      'kbbbkbbbk',
      'kbbbkbbbk',
      'kbbbybbbk',
      'kbbbybbbk',
      'kbbbybbbk',
      '.kbbybbk.',
      '..kbbbk..',
      '...kbk...',
    ]),
  );
}

// A plan of the building with the patrol route.
function floorPlan() {
  return idle(
    map([
      'kkkkkkkkkkkkkk',
      'kSSSSSSSSSSSSk',
      'kSBBBSBBSBBBSk',
      'kSBrBSBBSBBBSk',
      'kSSSSSSSSSSSSk',
      'kSBBSBBBSBrBSk',
      'kSBBSBBBSBBBSk',
      'kSSSSSSSSSSSSk',
      'kkkkkkkkkkkkkk',
    ]),
  );
}

// A wall cabinet of keys on hooks.
function keyCabinet() {
  return idle(
    map(['oooooooo', 'o.y.y.yo', 'o.y.y.yo', 'o......o', 'oy.y.y.o', 'oy.y.y.o', 'oooooooo']),
  );
}

// Radios charging on the wall; with the shift in, most of them are out.
function radioCharger() {
  return looks((busy) => {
    const canvas = map(['..........', 'ssssssssss', 'sgsgsgsgss', 'ssssssssss']);
    [0, 2, 4, 6].forEach((x, index) => {
      if (busy && index > 0) return;
      canvas.drawMap(x + 1, 0, ['k', 'k'], legend);
      canvas.set(x + 1, 2, 'leaf');
    });
    return canvas;
  });
}

function lockers() {
  const canvas = new PixelCanvas(15, 20);
  [0, 8].forEach((left) => {
    canvas.fillRect(left, 0, 7, 20, 'slate');
    canvas.strokeRect(left, 0, 7, 20, 'ink');
    canvas.vline(left + 1, 1, 18, 'gray');
    canvas.hline(left + 2, 2, 3, 'charcoal');
    canvas.hline(left + 2, 4, 3, 'charcoal');
    canvas.set(left + 5, 9, 'lamp');
  });
  return idle(canvas);
}

function filingCabinet() {
  return idle(
    map([
      'gggggggg',
      'gvvvvvvg',
      'gv.kk.vg',
      'gvvvvvvg',
      'gggggggg',
      'gvvvvvvg',
      'gv.kk.vg',
      'gvvvvvvg',
      'gggggggg',
      'gvvvvvvg',
      'gv.kk.vg',
      'gvvvvvvg',
      'gggggggg',
      's......s',
    ]),
  );
}

function waterCooler() {
  return idle(
    map([
      '.SSS.',
      'SBBBS',
      'SBBBS',
      '.SSS.',
      'wwwww',
      'wkwrw',
      'wwwww',
      'wvvvw',
      'wvvvw',
      'wvvvw',
      'wvvvw',
      'wvvvw',
      'wwwww',
      'g...g',
    ]),
  );
}

// A rack of video recorders with blinking lights while recording.
function recorderRack() {
  return looks((on) => {
    const canvas = new PixelCanvas(9, 18);
    canvas.fillRect(0, 0, 9, 18, 'charcoal');
    canvas.strokeRect(0, 0, 9, 18, 'ink');
    for (let y = 2; y < 16; y += 3) {
      canvas.hline(1, y, 7, 'slate');
      canvas.set(6, y + 1, on ? 'leaf' : 'slate');
      canvas.set(4, y + 1, on && y % 2 === 0 ? 'cloth-red' : 'slate');
    }
    canvas.set(1, 17, 'ink');
    canvas.set(7, 17, 'ink');
    return canvas;
  });
}

function coatRack() {
  return idle(
    map([
      'c.c.c',
      '.ccc.',
      '..c..',
      '.bbb.',
      'bbbbb',
      'bb.bb',
      '..c..',
      '..c..',
      '..c..',
      '..c..',
      '..c..',
      '..c..',
      '..c..',
      '..c..',
      '.ccc.',
      'cc.cc',
    ]),
  );
}

// The control desk: a long console with a chair in front of it.
function controlDesk() {
  return looks((on) => {
    const canvas = new PixelCanvas(28, 11);
    screen(canvas, 4, 0, 7, 5, on, 'glass');
    screen(canvas, 12, 0, 7, 5, on, 'leaf');
    canvas.hline(20, 4, 5, on ? 'leaf' : 'gray');
    canvas.hline(20, 3, 5, 'charcoal');
    canvas.fillRect(0, 5, 28, 2, 'gray');
    canvas.hline(0, 5, 28, 'silver');
    canvas.fillRect(1, 7, 26, 4, 'slate');
    canvas.vline(1, 7, 4, 'charcoal');
    canvas.vline(26, 7, 4, 'charcoal');
    // The chair, empty, in front of the console.
    canvas.drawMap(11, 5, ['ccc', 'ccc', 'ccc', 'cccccc', '..c...', '.c.c..'], legend);
    return canvas;
  });
}

// A desk with one monitor and a chair in front of it.
function desk() {
  return looks((on) => {
    const canvas = new PixelCanvas(18, 11);
    screen(canvas, 2, 0, 7, 5, on, 'glass');
    canvas.drawMap(11, 3, ['wwC', 'Cww'], legend);
    canvas.hline(0, 5, 18, 'wood-light');
    canvas.hline(0, 6, 18, 'wood');
    canvas.vline(1, 7, 4, 'wood-dark');
    canvas.vline(16, 7, 4, 'wood-dark');
    canvas.drawMap(6, 4, ['ccc', 'ccc', 'ccc', 'cccccc', '..c...', '..c...', '.c.c..'], legend);
    return canvas;
  });
}

function bench() {
  return idle(
    map([
      'oooooooooooooo',
      'dddddddddddddd',
      '.g..........g.',
      '.g..........g.',
      '.g..........g.',
      'ss..........ss',
    ]),
  );
}

export function securityProps() {
  return {
    'monitor-wall': monitorWall(),
    'monitor-pair': monitorPair(),
    shield: shield(),
    'floor-plan': floorPlan(),
    'key-cabinet': keyCabinet(),
    'radio-charger': radioCharger(),
    corkboard: idle(corkboard()),
    clock: idle(clock()),
    lockers: lockers(),
    'filing-cabinet': filingCabinet(),
    'water-cooler': waterCooler(),
    'recorder-rack': recorderRack(),
    'coat-rack': coatRack(),
    'plant-medium': idle(plantMedium()),
    'control-desk': controlDesk(),
    desk: desk(),
    bench: bench(),
  };
}

export const securityGroup = {
  name: 'security',
  draw() {
    return propSprites('security', securityProps(), [[12, 7]]);
  },
};
