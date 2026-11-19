import { PixelCanvas } from '../canvas.mjs';
import { timeClock } from './housekeeping.mjs';
import { clock, legend as officeLegend, propSprites } from './office.mjs';

// Obrador (the builders' site office) props, placed by the client on top of the bare room it
// shares with housekeeping (units/housekeeping/empty_day): tools, uniforms and building
// materials. Looks: `idle` with the crew out of the room, `busy` with the crew in (vests,
// hard hats and some tools taken). The builders walk in as people, never as part of a prop.
// The sizes here must match apps/web/src/render/interior/obrador.ts.

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

function looks(draw) {
  return { idle: draw(false), busy: draw(true) };
}

// Uniforms: hi-vis vests and hard hats on hooks over a bench with boots under it.
function uniformRack() {
  return looks((busy) => {
    const canvas = new PixelCanvas(16, 18);
    canvas.hline(0, 0, 16, 'wood');
    for (let index = 0; index < 3; index++) {
      const left = 1 + index * 5;
      canvas.set(left + 1, 1, 'charcoal');
      if (busy && index > 0) continue;
      canvas.drawMap(left, 2, ['.yy.', 'yyyy'], legend);
      canvas.drawMap(left, 4, ['e..e', 'eeee', 'wwww', 'eeee', 'eeee', 'e..e'], legend);
    }
    canvas.hline(0, 12, 16, 'wood-light');
    canvas.hline(0, 13, 16, 'wood');
    canvas.vline(1, 14, 4, 'wood-dark');
    canvas.vline(14, 14, 4, 'wood-dark');
    if (!busy) canvas.drawMap(4, 15, ['dd.dd.dd', 'dd.dd.dd', 'kkkkkkkk'], legend);
    else canvas.drawMap(4, 15, ['dd......', 'dd......', 'kk......'], legend);
    return canvas;
  });
}

function hardHatShelf() {
  return looks((busy) => {
    const canvas = map(['............', '............', 'oooooooooooo', 'd..........d']);
    const hats = busy ? [0] : [0, 4, 8];
    hats.forEach((left, index) =>
      canvas.drawMap(
        left,
        0,
        ['.yy.', 'yyyy'].map((row) => (index === 1 ? row.replaceAll('y', 'w') : row)),
        legend,
      ),
    );
    return canvas;
  });
}

// A pegboard of hand tools; with the crew in, some hooks are empty.
function pegboard() {
  return looks((busy) => {
    const canvas = new PixelCanvas(18, 10);
    canvas.fillRect(0, 0, 18, 10, 'wood-light');
    canvas.strokeRect(0, 0, 18, 10, 'wood');
    for (let y = 2; y < 9; y += 2) for (let x = 2; x < 17; x += 3) canvas.set(x, y, 'wood');
    // Hammer, saw, wrench, screwdrivers, tape.
    canvas.drawMap(2, 1, ['ss.', '.d.', '.d.', '.d.', '.d.'], legend);
    if (!busy) canvas.drawMap(5, 1, ['d.....', 'vvvvvv', 'vvvvv.', 'vvvv..'], legend);
    canvas.drawMap(12, 1, ['s.s', '.s.', '.s.', '.s.', '.s.'], legend);
    if (!busy) canvas.drawMap(5, 6, ['r.b.y', 'r.b.y', 's.s.s'], legend);
    canvas.drawMap(14, 6, ['yyy', 'yky', 'yyy'], legend);
    return canvas;
  });
}

function toolChest() {
  return idle(
    map([
      'rrrrrrrrrrrr',
      'rcccccccccrr',
      'rrrrrrrrrrrr',
      'rvvvvvvvvvvr',
      'rrrrrrrrrrrr',
      'rvvvvvvvvvvr',
      'rrrrrrrrrrrr',
      'rvvvvvvvvvvr',
      'rrrrrrrrrrrr',
      'rvvvvvvvvvvr',
      'rrrrrrrrrrrr',
      '.k........k.',
    ]),
  );
}

function lockers() {
  const canvas = new PixelCanvas(15, 20);
  [0, 8].forEach((left) => {
    canvas.fillRect(left, 0, 7, 20, 'leaf-dark');
    canvas.strokeRect(left, 0, 7, 20, 'ink');
    canvas.vline(left + 1, 1, 18, 'leaf');
    canvas.hline(left + 2, 2, 3, 'ink');
    canvas.hline(left + 2, 4, 3, 'ink');
    canvas.set(left + 5, 9, 'silver');
  });
  return idle(canvas);
}

function ladder() {
  const rows = [];
  for (let y = 0; y < 20; y++) rows.push(y % 4 === 1 ? 'vvvvvvv' : 'v.....v');
  rows[19] = 'k.....k';
  return idle(map(rows));
}

function cementBags() {
  return idle(
    map([
      '...CCCCCC...',
      '..CgCCCCgC..',
      'CCCCCCCCCCCC',
      'CgCCCCCgCCCC',
      'CCCCCCCCCCCC',
      'CCCCCCCCCCCC',
      'oooooooooooo',
    ]),
  );
}

function paintCans() {
  return idle(map(['.vv..vv.', 'wwww.bbb', 'wrrw.bbb', 'wwww.bwb', 'wwww.bbb']));
}

function drill() {
  return idle(map(['.......', '..yyyyk', 'ssyyyy.', '..yy...', '..kk...', '..kk...']));
}

// In the middle of the room.

function workbench() {
  return idle(
    map([
      '..ss..........yyy...',
      '.ssss....d.........',
      'llllllllllllllllllll',
      'oooooooooooooooooooo',
      'od................do',
      'od..vvvvvvvvvvvv..do',
      'od..ssssssssssss..do',
      'od................do',
      'od................do',
      'dd................dd',
    ]),
  );
}

function wheelbarrow() {
  return idle(
    map([
      'eeeeeeeee.....',
      'eeeeeeeeee....',
      '.eeeeeeee.dddd',
      '..eeeeee......',
      '...kk.d...d...',
      '..kkkk.d...d..',
      '...kk.........',
    ]),
  );
}

function lumberPile() {
  return idle(
    map([
      'llllllllllllllllll',
      'oooooooooooooooooo',
      '..llllllllllllllll',
      '..oooooooooooooooo',
      'llllllllllllllll..',
      'oooooooooooooooo..',
    ]),
  );
}

function sawhorse() {
  return idle(
    map([
      'llllllllllll',
      'oooooooooooo',
      '.d.d....d.d.',
      '.d..d..d..d.',
      'd...d..d...d',
      'd....dd....d',
      'd....dd....d',
    ]),
  );
}

function cones() {
  return idle(
    map(['.e..', '.e..', 'eweE', 'eeee', 'ewee', 'kkkk'].map((row) => row.replace('E', '.'))),
  );
}

// On the wall.

function blueprint() {
  return idle(
    map([
      'BBBBBBBBBBBBBB',
      'BSSSSSSBSSSSSB',
      'BSBBBBSBSBBBSB',
      'BSBBBBSSSBBBSB',
      'BSSSSSSBSSSSSB',
      'BBBBBSBBBBBBBB',
      'BSSSSSSSSSSSSB',
      'BBBBBBBBBBBBBB',
    ]),
  );
}

// A safety poster: wear your hard hat.
function safetyPoster() {
  return idle(
    map([
      'kkkkkkkk',
      'kwwwwwwk',
      'kwwyywwk',
      'kwyyyywk',
      'kwwwwwwk',
      'kbbbbbbk',
      'kwwwwwwk',
      'kbbbwwwk',
      'kkkkkkkk',
    ]),
  );
}

export function obradorProps() {
  return {
    'uniform-rack': uniformRack(),
    'hard-hat-shelf': hardHatShelf(),
    pegboard: pegboard(),
    'tool-chest': toolChest(),
    lockers: lockers(),
    ladder: ladder(),
    'cement-bags': cementBags(),
    'paint-cans': paintCans(),
    drill: drill(),
    workbench: workbench(),
    wheelbarrow: wheelbarrow(),
    'lumber-pile': lumberPile(),
    sawhorse: sawhorse(),
    cones: cones(),
    blueprint: blueprint(),
    'safety-poster': safetyPoster(),
    'time-clock': timeClock(),
    clock: idle(clock()),
  };
}

export const obradorGroup = {
  name: 'obrador',
  draw() {
    return propSprites('obrador', obradorProps(), [[12, 7]]);
  },
};
