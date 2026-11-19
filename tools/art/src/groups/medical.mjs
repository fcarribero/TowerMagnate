import { PixelCanvas } from '../canvas.mjs';
import { sink } from './housekeeping.mjs';
import { clock, legend as officeLegend, plantMedium, propSprites } from './office.mjs';

// Medical center props, placed by the client on top of the bare room
// (units/medical-center/empty_day). Looks: `idle` with nobody on shift, `busy` with the staff
// in (monitors on, beds slept in, the light box lit). Patients and nurses walk in as people,
// never as part of a prop: a bed in use is drawn turned down and empty.
// The sizes here must match apps/web/src/render/interior/medical.ts.

const legend = { ...officeLegend, n: 'night' };

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

// A ward bed with rails at both ends; in use, the sheet is turned down.
function hospitalBed() {
  return looks((used) => {
    const canvas = new PixelCanvas(30, 14);
    canvas.fillRect(0, 4, 30, 2, 'silver');
    canvas.fillRect(0, 6, 30, 6, 'white');
    canvas.fillRect(8, 6, 22, 6, 'cloth-blue');
    canvas.hline(8, 11, 22, 'night');
    canvas.fillRect(1, 4, 7, 2, 'cloud');
    canvas.vline(0, 0, 14, 'silver');
    canvas.vline(29, 2, 12, 'silver');
    canvas.vline(1, 12, 2, 'gray');
    canvas.vline(28, 12, 2, 'gray');
    if (used) {
      canvas.fillRect(8, 6, 6, 2, 'white');
      canvas.hline(2, 4, 5, 'silver');
      canvas.hline(8, 5, 18, 'cloth-blue');
    }
    return canvas;
  });
}

function examTable() {
  return idle(
    map([
      '.CCCC...............',
      'wwwwwwwwwwwwwwwwwwww',
      'CCCCCCCCCCCCCCCCCCCC',
      'vvvvvvvvvvvvvvvvvvvv',
      '.g................g.',
      '.g...vvvvvvvvvv...g.',
      '.g...v..v..v..v...g.',
      '.g...vvvvvvvvvv...g.',
      'ss................ss',
    ]),
  );
}

function gurney() {
  return idle(
    map([
      'wwwwwwwwwwwwwwwwwwwwwwww',
      'CCCCCCCCCCCCCCCCCCCCCCCC',
      'vvvvvvvvvvvvvvvvvvvvvvvv',
      '..g..................g..',
      '..g..................g..',
      '..g..................g..',
      'gggggggggggggggggggggggg',
      '..g..................g..',
      '.kkk................kkk.',
    ]),
  );
}

function wheelchair() {
  return idle(
    map([
      'g........',
      'g........',
      'gbbbb....',
      'gbbbb....',
      'gbbbbbbbg',
      '.gggggg.g',
      '.k.k..g.g',
      'k...k.g..',
      'k...k..g.',
      '.k.k...kk',
    ]),
  );
}

// A drip stand with a bag of saline.
function ivStand() {
  return idle(
    map([
      'g...g',
      'ggggg',
      '.S.g.',
      '.S.g.',
      '.S.g.',
      '..wg.',
      '...g.',
      '...g.',
      '...g.',
      '...g.',
      '...g.',
      '...g.',
      '...g.',
      '...g.',
      '..ggg',
      'k.k.k',
    ]),
  );
}

// A folding screen of three panels.
function privacyScreen() {
  return idle(
    map([
      'g...g...g...g',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'gSSSgCCCgSSSg',
      'g...g...g...g',
      'g...g...g...g',
      'k...k...k...k',
    ]),
  );
}

// A vital signs monitor on a wheeled stand: a green trace while someone is in.
function vitalsMonitor() {
  return looks((on) => {
    const canvas = map([
      'kkkkkkkk',
      'k......k',
      'k......k',
      'k......k',
      'kkkkkkkk',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '...gg...',
      '.gggggg.',
      '.k....k.',
    ]);
    canvas.fillRect(1, 1, 6, 3, on ? 'night' : 'charcoal');
    if (on) canvas.drawMap(1, 1, ['...L..', 'LL.L.L', '..L.L.'], legend);
    return canvas;
  });
}

// The white cabinet of medicines, red crosses on its doors.
function medicineCabinet() {
  return idle(
    map([
      'CCCCCCCCCCCCCCCCCC',
      'CvvvvvvvvvvvvvvvvC',
      'Cv......v.......vC',
      'Cv..r...v...r...vC',
      'Cv.rrr..v..rrr..vC',
      'Cv..r...v...r...vC',
      'Cv......v.......vC',
      'CvvvvvvvvvvvvvvvvC',
      'Cv......v.......vC',
      'Cv..ww..v..ww...vC',
      'Cv......v.......vC',
      'CvvvvvvvvvvvvvvvvC',
      'CCCCCCCCCCCCCCCCCC',
      'g................g',
    ]),
  );
}

function receptionDesk() {
  return idle(
    map([
      '..ss..........ww....',
      '..sbs.........wC....',
      'llllllllllllllllllll',
      'oooooooooooooooooooo',
      'oCCCCCCCCCCCCCCCCCCo',
      'oCCCCCrCCCCCCCCCCCCo',
      'oCCCCrrrCCCCCCCCCCCo',
      'oCCCCCrCCCCCCCCCCCCo',
      'oooooooooooooooooooo',
      'dddddddddddddddddddd',
    ]),
  );
}

function waitingChairs() {
  return idle(
    map([
      'bbbb.bbbb.bbbb.bbbb.',
      'bbbb.bbbb.bbbb.bbbb.',
      'bbbb.bbbb.bbbb.bbbb.',
      'bbbbbbbbbbbbbbbbbbbb',
      'gggggggggggggggggggg',
      '.g................g.',
      '.g................g.',
      'ss................ss',
    ]),
  );
}

function redCross() {
  return idle(
    map([
      'vvvvvvvvvvvv',
      'vwwwwwwwwwwv',
      'vwwwwrrwwwwv',
      'vwwwwrrwwwwv',
      'vwwrrrrrrwwv',
      'vwwrrrrrrwwv',
      'vwwwwrrwwwwv',
      'vwwwwrrwwwwv',
      'vwwwwwwwwwwv',
      'vvvvvvvvvvvv',
    ]),
  );
}

// A light box for x-rays, lit while the staff are in.
function lightBox() {
  return looks((on) => {
    const canvas = new PixelCanvas(14, 9);
    canvas.fillRect(0, 0, 14, 9, 'gray');
    canvas.fillRect(1, 1, 12, 7, on ? 'cloud' : 'slate');
    const bone = on ? 'white' : 'silver';
    canvas.vline(4, 2, 5, bone);
    canvas.vline(9, 2, 5, bone);
    canvas.hline(3, 3, 3, bone);
    canvas.hline(8, 3, 3, bone);
    canvas.hline(4, 5, 6, bone);
    return canvas;
  });
}

function eyeChart() {
  return idle(
    map([
      'vvvvvvv',
      'vwwkwwv',
      'vwwwwwv',
      'vwkwkwv',
      'vwwwwwv',
      'vkwkwkv',
      'vwwwwwv',
      'vkkwkkv',
      'vwwwwwv',
      'vvvvvvv',
    ]),
  );
}

function firstAidBox() {
  return idle(map(['wwwwwwww', 'wwwrrwww', 'wwrrrrww', 'wwwrrwww', 'wwwwwwww', 'vvvvvvvv']));
}

export function medicalProps() {
  return {
    'hospital-bed': hospitalBed(),
    'exam-table': examTable(),
    gurney: gurney(),
    wheelchair: wheelchair(),
    'iv-stand': ivStand(),
    'privacy-screen': privacyScreen(),
    'vitals-monitor': vitalsMonitor(),
    'medicine-cabinet': medicineCabinet(),
    'reception-desk': receptionDesk(),
    'waiting-chairs': waitingChairs(),
    sink: sink(),
    'plant-medium': idle(plantMedium()),
    'red-cross': redCross(),
    'light-box': lightBox(),
    'eye-chart': eyeChart(),
    'first-aid': firstAidBox(),
    clock: idle(clock()),
  };
}

export const medicalGroup = {
  name: 'medical',
  draw() {
    return propSprites('medical', medicalProps(), [[14, 8]]);
  },
};
