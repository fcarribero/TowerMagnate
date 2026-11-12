import { PixelCanvas } from './canvas.mjs';
import { metrics } from './metrics.mjs';
import { CALL_PANEL_TOP } from './groups/transport.mjs';

const SCENE_TILES = 24;
const TOWER_FIRST_TILE = 6;
const TOWER_TILES = 12;
const COLUMN_EVERY = 4;
const LEVEL_ROWS = 17;
const FIRST_BASEMENT_ROW = 7;
const TUNNEL_LAMP_EVERY = 4;

// Soil subject for basement levels S1 to S9; S10 is the subway tunnel.
const SOIL_BY_BASEMENT = Array.from({ length: 9 }, (_, index) => `soil-${index + 1}`);
const GAP = 4;
const RULER_PLATE = { x: 1, y: 9 };
const RULER_TILES = 3;

function tunnelSubject(tile) {
  if (tile === RULER_TILES) {
    return 'subway-tunnel-edge-left';
  }
  if (tile === SCENE_TILES - 1) {
    return 'subway-tunnel-edge-right';
  }
  return tile % TUNNEL_LAMP_EVERY === 2 ? 'subway-tunnel-lamp' : 'subway-tunnel';
}

function tileAcross(scene, sprite, top) {
  for (let x = 0; x < scene.width; x += sprite.width) {
    scene.stamp(sprite, x, top);
  }
}

function eachTowerTile(callback) {
  for (let tile = 0; tile < TOWER_TILES; tile++) {
    callback(tile, (TOWER_FIRST_TILE + tile) * metrics.tileWidth);
  }
}

// A small cross-section with every structure sprite in place: sky, a tower
// with a sky lobby, a bare floor and a two-floor lobby, then basement, soil
// strata down to the S10 subway tunnel, and the level ruler on the left.
export function drawStructureScene(sprites, time) {
  const sprite = (id) => sprites[id];
  const floor = metrics.floorHeight;
  const scene = new PixelCanvas(SCENE_TILES * metrics.tileWidth, LEVEL_ROWS * floor);
  const towerLeft = TOWER_FIRST_TILE * metrics.tileWidth;
  const towerRight = towerLeft + TOWER_TILES * metrics.tileWidth;
  const groundY = FIRST_BASEMENT_ROW * floor;
  const skyTime = time === 'dusk' ? 'dusk' : time;
  const unitTime = time === 'night' ? 'night' : 'day';

  tileAcross(scene, sprite(`sky/${skyTime}/top`), 0);
  tileAcross(scene, sprite(`sky/${skyTime}/middle`), floor);
  for (let row = 2; row < 7; row++) {
    tileAcross(scene, sprite(`sky/${skyTime}/horizon`), row * floor);
  }
  const body = time === 'night' ? 'sky/moon/night' : 'sky/sun/day';
  scene.stamp(sprite(body), 20, 10);
  scene.stamp(sprite(`sky/cloud-a/${skyTime}`), 140, 24);
  scene.stamp(sprite(`sky/cloud-b/${skyTime}`), 60, 46);
  const hills = sprite(`sky/hills/${skyTime}`);
  const skyline = sprite(`sky/skyline/${skyTime}`);
  tileAcross(scene, hills, groundY - hills.height);
  tileAcross(scene, skyline, groundY - skyline.height);

  SOIL_BY_BASEMENT.forEach((subject, index) => {
    tileAcross(scene, sprite(`structure/${subject}/${unitTime}`), groundY + index * floor);
  });
  const tunnelY = groundY + SOIL_BY_BASEMENT.length * floor;
  for (let tile = 0; tile < SCENE_TILES; tile++) {
    scene.stamp(
      sprite(`structure/${tunnelSubject(tile)}/${unitTime}`),
      tile * metrics.tileWidth,
      tunnelY,
    );
  }

  scene.stamp(sprite(`structure/roof-left/${unitTime}`), towerLeft - 3, 3 * floor - 4);
  eachTowerTile((tile, x) => scene.stamp(sprite(`structure/roof/${unitTime}`), x, 3 * floor - 4));
  scene.stamp(sprite(`structure/roof-right/${unitTime}`), towerRight, 3 * floor - 4);

  eachTowerTile((tile, x) => {
    const column = tile % COLUMN_EVERY === 1 ? '-column' : '';
    scene.stamp(sprite(`structure/sky-lobby${column}/${unitTime}`), x, 3 * floor);
    scene.stamp(sprite(`structure/floor/${unitTime}`), x, 4 * floor);
    scene.stamp(sprite(`structure/lobby-2${column}/${unitTime}`), x, 5 * floor);
    scene.stamp(sprite(`structure/basement/${unitTime}`), x, 7 * floor);
    scene.stamp(sprite(`structure/basement/${unitTime}`), x, 8 * floor);
  });
  for (let row = 3; row < 7; row++) {
    scene.stamp(sprite(`structure/edge-left/${unitTime}`), towerLeft - 3, row * floor);
    scene.stamp(sprite(`structure/edge-right/${unitTime}`), towerRight, row * floor);
  }

  for (let row = 7; row < 9; row++) {
    scene.stamp(sprite(`structure/basement-edge-left/${unitTime}`), towerLeft - 3, row * floor);
    scene.stamp(sprite(`structure/basement-edge-right/${unitTime}`), towerRight, row * floor);
  }

  const hoveredRow = 6;
  for (let row = 0; row < LEVEL_ROWS; row++) {
    const hover = row === hoveredRow ? '-hover' : '';
    scene.stamp(sprite('ui/ruler-background'), 0, row * floor);
    scene.stamp(sprite(`ui/ruler-plate${hover}`), RULER_PLATE.x, row * floor + RULER_PLATE.y);
  }
  return scene;
}

// Day, dusk and night scenes side by side on an ink background.
export function drawStructurePreview(sprites) {
  const scenes = ['day', 'dusk', 'night'].map((time) => drawStructureScene(sprites, time));
  const width = GAP + scenes.reduce((total, scene) => total + scene.width + GAP, 0);
  const height = scenes[0].height + 2 * GAP;
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'ink');
  let left = GAP;
  for (const scene of scenes) {
    sheet.stamp(scene, left, GAP);
    left += scene.width + GAP;
  }
  return sheet;
}

// One row per unit subject with every variant left to right, on an ink background.
export function drawUnitSheet(sprites, subjects) {
  const rows = subjects.map((subject) =>
    Object.entries(sprites)
      .filter(([id]) => id.startsWith(`units/${subject}/`))
      .map(([, canvas]) => canvas),
  );
  const rowWidth = (row) => GAP + row.reduce((total, canvas) => total + canvas.width + GAP, 0);
  const width = Math.max(...rows.map(rowWidth));
  const height = GAP + rows.length * (metrics.floorHeight + GAP);
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'ink');
  rows.forEach((row, rowIndex) => {
    let left = GAP;
    for (const canvas of row) {
      sheet.stamp(canvas, left, GAP + rowIndex * (metrics.floorHeight + GAP));
      left += canvas.width + GAP;
    }
  });
  return sheet;
}

// One row per service subject, with every variant left to right and tall units
// (recycling center, subway station) at their full height.
export function drawServiceSheet(sprites, subjects) {
  const rows = subjects.map((subject) =>
    Object.entries(sprites)
      .filter(([id]) => id.startsWith(`units/${subject}/`))
      .map(([, canvas]) => canvas),
  );
  const rowWidth = (row) => GAP + row.reduce((total, canvas) => total + canvas.width + GAP, 0);
  const rowHeight = (row) => Math.max(...row.map((canvas) => canvas.height)) + GAP;
  const width = Math.max(...rows.map(rowWidth));
  const height = GAP + rows.reduce((total, row) => total + rowHeight(row), 0);
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'ink');
  let top = GAP;
  for (const row of rows) {
    let left = GAP;
    for (const canvas of row) {
      sheet.stamp(canvas, left, top);
      left += canvas.width + GAP;
    }
    top += rowHeight(row);
  }
  return sheet;
}

const ICON_CELL = 20;
const ICON_COLUMNS = 8;

// Every UI icon on the sky color, in the order the group draws them.
export function drawIconSheet(sprites) {
  const icons = Object.entries(sprites)
    .filter(([id]) => /^ui\/(tool|cat|unit|star|money|population|window|alarm|lock)/.test(id))
    .map(([, canvas]) => canvas);
  const rows = Math.ceil(icons.length / ICON_COLUMNS);
  const sheet = new PixelCanvas(ICON_COLUMNS * ICON_CELL, rows * ICON_CELL);
  sheet.fillRect(0, 0, sheet.width, sheet.height, 'sky-light');
  icons.forEach((icon, index) => {
    const left = (index % ICON_COLUMNS) * ICON_CELL + 2;
    const top = Math.floor(index / ICON_COLUMNS) * ICON_CELL + 2;
    sheet.stamp(icon, left, top);
  });
  return sheet;
}

const SHAFT_LEVELS = 3;
const CAR_INSET_X = 4;
const CAR_TOP_IN_FLOOR =
  metrics.floorHeight - metrics.slabHeight - metrics.elevatorCar.standard.height;

// One shaft per elevator type on bare floors: the car waits with its doors
// closed on the top level and open on the bottom level.
export function drawTransportPreview(sprites) {
  const floor = metrics.floorHeight;
  const types = ['standard', 'service', 'express'];
  const shafts = types.map((type) => ({
    type,
    body: sprites[`transport/${type}-shaft/body`],
    top: sprites[`transport/${type}-shaft/top`],
    bottom: sprites[`transport/${type}-shaft/bottom`],
  }));
  const capHeight = shafts[0].top.height;
  const pitHeight = shafts[0].bottom.height;
  const width = shafts.reduce(
    (total, shaft) => total + shaft.body.width + 2 * metrics.tileWidth,
    0,
  );
  const height = capHeight + SHAFT_LEVELS * floor + pitHeight;
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'ink');
  for (let level = 0; level < SHAFT_LEVELS; level++) {
    tileAcross(sheet, sprites['structure/floor/day'], capHeight + level * floor);
  }

  let left = metrics.tileWidth;
  for (const { type, body, top, bottom } of shafts) {
    sheet.stamp(top, left, 0);
    const callStates = ['up', 'idle', 'both'];
    for (let level = 0; level < SHAFT_LEVELS; level++) {
      const levelTop = capHeight + level * floor;
      sheet.stamp(body, left, levelTop);
      sheet.stamp(sprites[`transport/${type}-shaft/landing`], left, levelTop);
      const panel = sprites[`transport/call-button/${callStates[level]}`];
      sheet.stamp(panel, left + body.width - panel.width, levelTop + CALL_PANEL_TOP);
    }
    sheet.stamp(bottom, left, capHeight + SHAFT_LEVELS * floor);
    const carX = left + CAR_INSET_X;
    sheet.stamp(sprites[`transport/${type}-car/closed`], carX, capHeight + CAR_TOP_IN_FLOOR);
    const lastLevelTop = capHeight + (SHAFT_LEVELS - 1) * floor;
    sheet.stamp(sprites[`transport/${type}-car/open`], carX, lastLevelTop + CAR_TOP_IN_FLOOR);
    left += body.width + 2 * metrics.tileWidth;
  }
  return sheet;
}

const PEOPLE_POSES = ['walk_01', 'walk_02', 'stand'];
const PERSON_GAP = 2;

// One row per person type: every variant in each pose, calm, on a light background so dark suits show.
export function drawPeopleSheet(sprites, types, variants) {
  const { frameWidth, frameHeight } = metrics.person;
  const columns = variants.length * PEOPLE_POSES.length;
  const width = GAP + columns * (frameWidth + PERSON_GAP) + (variants.length - 1) * GAP;
  const height = GAP + types.length * (frameHeight + GAP);
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'concrete-light');
  types.forEach((type, row) => {
    let left = GAP;
    for (const variant of variants) {
      for (const pose of PEOPLE_POSES) {
        sheet.stamp(
          sprites[`people/${type}-${variant}/${pose}`],
          left,
          GAP + row * (frameHeight + GAP),
        );
        left += frameWidth + PERSON_GAP;
      }
      left += GAP;
    }
  });
  return sheet;
}

const TINT_STATES = ['walk', 'walk-pink', 'walk-red'];

function personOnFloor(scene, person, left, floorTop) {
  const feetRow = metrics.floorHeight - metrics.slabHeight - 1;
  scene.stamp(person, left, floorTop + feetRow - person.height + 1);
}

// Each person type calm, stressed and very stressed, standing on real floors:
// a bare floor and a lit hotel room, by day and by night.
export function drawTintSheet(sprites, types) {
  const floor = metrics.floorHeight;
  const backgrounds = [
    (time) => sprites[`structure/floor/${time}`],
    (time) => sprites[`units/single-room/occupied_${time}`],
  ];
  const groupWidth = TINT_STATES.length * metrics.person.frameWidth + metrics.tileWidth;
  const width = types.length * groupWidth + metrics.tileWidth;
  const rows = ['day', 'night'].flatMap((time) =>
    backgrounds.map((background) => ({ time, background })),
  );
  const sheet = new PixelCanvas(width, rows.length * floor);
  rows.forEach(({ time, background }, row) => {
    const tile = background(time);
    for (let x = 0; x < width; x += tile.width) {
      sheet.stamp(tile, x, row * floor);
    }
    types.forEach((type, index) => {
      TINT_STATES.forEach((state, step) => {
        const variant = index % 2 === 0 ? 'a' : 'b';
        const left = metrics.tileWidth + index * groupWidth + step * metrics.person.frameWidth;
        personOnFloor(sheet, sprites[`people/${type}-${variant}/${state}_01`], left, row * floor);
      });
    });
  });
  return sheet;
}

const BAND_GAP = 1;

// Every variant of every type calm, stressed and very stressed, standing on the day sky and
// the night sky. One row per type, variants left to right, three bands per variant.
export function drawTintVariantSheet(sprites, types, variants) {
  const { frameWidth, frameHeight } = metrics.person;
  const variantWidth = TINT_STATES.length * (frameWidth + BAND_GAP) + metrics.tileWidth;
  const halfWidth = variants.length * variantWidth + metrics.tileWidth;
  const rowHeight = frameHeight + 2 * BAND_GAP * 2;
  const sheet = new PixelCanvas(2 * halfWidth, types.length * rowHeight);
  ['day', 'night'].forEach((time, half) => {
    const sky = sprites[`sky/${time}/middle`];
    for (let y = 0; y < sheet.height; y += sky.height) {
      for (let x = 0; x < halfWidth; x += sky.width) {
        sheet.stamp(sky, half * halfWidth + x, y);
      }
    }
    types.forEach((type, row) => {
      variants.forEach((variant, column) => {
        TINT_STATES.forEach((state, step) => {
          const left =
            half * halfWidth +
            metrics.tileWidth +
            column * variantWidth +
            step * (frameWidth + BAND_GAP);
          sheet.stamp(sprites[`people/${type}-${variant}/${state}_01`], left, row * rowHeight + 2);
        });
      });
    });
  });
  return sheet;
}

const WALKWAY_LEVELS = 3;
const WALKWAY_SPRITES = [
  'stairs/TIME',
  'escalator/TIME_01',
  'escalator/TIME_02',
  'escalator/TIME_03',
  'escalator/TIME_04',
];

function drawWalkwayScene(sprites, time) {
  const floor = metrics.floorHeight;
  const gap = metrics.tileWidth;
  const ids = WALKWAY_SPRITES.map((id) => `transport/${id.replace('TIME', time)}`);
  const walkwayWidth = sprites[ids[0]].width;
  const width = gap + ids.length * (walkwayWidth + gap);
  const scene = new PixelCanvas(width, WALKWAY_LEVELS * floor);
  for (let level = 0; level < WALKWAY_LEVELS; level++) {
    tileAcross(scene, sprites[`structure/floor/${time}`], level * floor);
  }
  ids.forEach((id, index) => {
    const left = gap + index * (walkwayWidth + gap);
    scene.stamp(sprites[id], left, floor);
    scene.stamp(sprites[id], left, 2 * floor);
  });
  return scene;
}

// Stairs and the four escalator frames stacked over two levels, day above night.
export function drawWalkwayPreview(sprites) {
  const scenes = ['day', 'night'].map((time) => drawWalkwayScene(sprites, time));
  const width = scenes[0].width + 2 * GAP;
  const height = GAP + scenes.reduce((total, scene) => total + scene.height + GAP, 0);
  const sheet = new PixelCanvas(width, height);
  sheet.fillRect(0, 0, width, height, 'ink');
  let top = GAP;
  for (const scene of scenes) {
    sheet.stamp(scene, GAP, top);
    top += scene.height + GAP;
  }
  return sheet;
}

const EVENT_GAP = 4;

// Every wedding bell and petal burst frame side by side on the day sky, bells first.
export function drawEventSheet(sprites) {
  const rows = [
    'events/wedding-bell/swing',
    'events/wedding-petals/burst',
    'events/wedding-couple/walk',
  ].map((prefix) =>
    Object.keys(sprites)
      .filter((id) => id.startsWith(prefix + '_'))
      .sort()
      .map((id) => sprites[id]),
  );
  const rowWidth = (frames) =>
    frames.reduce((sum, frame) => sum + frame.width + EVENT_GAP, EVENT_GAP);
  const rowHeight = (frames) => Math.max(...frames.map((frame) => frame.height)) + EVENT_GAP;
  const sheet = new PixelCanvas(
    Math.max(...rows.map(rowWidth)),
    rows.reduce((sum, frames) => sum + rowHeight(frames), EVENT_GAP),
  );
  sheet.fillRect(0, 0, sheet.width, sheet.height, 'sky');
  let top = EVENT_GAP;
  for (const frames of rows) {
    let left = EVENT_GAP;
    for (const frame of frames) {
      sheet.stamp(frame, left, top);
      left += frame.width + EVENT_GAP;
    }
    top += rowHeight(frames);
  }
  return sheet;
}

const EFFECT_GAP = 4;
const EFFECT_FRAME = /_\d{2}$/;

// One row per effect: its frames left to right on the day sky, tallest frame sets the row height.
export function drawEffectsSheet(sprites) {
  const rows = new Map();
  for (const id of Object.keys(sprites).filter((name) => name.startsWith('effects/'))) {
    const effect = id.replace(EFFECT_FRAME, '');
    rows.set(effect, [...(rows.get(effect) ?? []), sprites[id]]);
  }
  const sized = [...rows.values()].map((frames) => ({
    frames,
    height: Math.max(...frames.map((frame) => frame.height)),
    width: frames.reduce((total, frame) => total + frame.width + EFFECT_GAP, EFFECT_GAP),
  }));
  const width = Math.max(...sized.map((row) => row.width));
  const height = sized.reduce((total, row) => total + row.height + EFFECT_GAP, EFFECT_GAP);
  const sheet = new PixelCanvas(width, height);
  const sky = sprites['sky/day/middle'];
  for (let y = 0; y < height; y += sky.height) {
    for (let x = 0; x < width; x += sky.width) {
      sheet.stamp(sky, x, y);
    }
  }
  let top = EFFECT_GAP;
  for (const row of sized) {
    let left = EFFECT_GAP;
    for (const frame of row.frames) {
      sheet.stamp(frame, left, top + row.height - frame.height);
      left += frame.width + EFFECT_GAP;
    }
    top += row.height + EFFECT_GAP;
  }
  return sheet;
}
