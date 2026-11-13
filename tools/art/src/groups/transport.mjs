import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';
import { drawEscalator, drawStairs, ESCALATOR_FRAMES } from '../transport/walkways.mjs';

const { tileWidth, floorHeight, elevatorCar } = metrics;
const SHAFT_TILES = { standard: 4, service: 4, express: 6 };
const WALL_WIDTH = 2;
const RAIL_WIDTH = 2;
const BEAM_ROW = floorHeight - metrics.slabHeight;
const TOP_CAP_HEIGHT = floorHeight;
const BOTTOM_CAP_HEIGHT = floorHeight;
const SHEAVE_TOP = 10;
const PIT_SHEAVE_TOP = 11;

// Each elevator type has its own ramp for the car frame and its own pattern on
// the beam that crosses the shaft at every slab.
const STYLES = {
  standard: {
    frame: { light: 'silver', base: 'gray', dark: 'slate' },
    backWall: 'cloud',
    beam: ['slate'],
  },
  service: {
    frame: { light: 'concrete-light', base: 'concrete', dark: 'concrete-dark' },
    backWall: 'concrete-light',
    beam: ['lamp', 'lamp', 'ink', 'ink'],
  },
  express: {
    frame: { light: 'wood-light', base: 'wood', dark: 'wood-dark' },
    backWall: 'wood-light',
    beam: ['cloth-blue', 'cloth-blue', 'cloth-blue', 'silver'],
  },
};

function shaftWidth(type) {
  return SHAFT_TILES[type] * tileWidth;
}

function cableColumns(width) {
  return [width / 2 - 3, width / 2 + 2];
}

function drawShaftWalls(tile) {
  const right = tile.width - WALL_WIDTH;
  tile.vline(0, 0, tile.height, 'gray');
  tile.vline(1, 0, tile.height, 'slate');
  tile.vline(right, 0, tile.height, 'slate');
  tile.vline(right + 1, 0, tile.height, 'charcoal');
}

function drawGuideRails(tile, top, height) {
  const leftRail = WALL_WIDTH;
  const rightRail = tile.width - WALL_WIDTH - RAIL_WIDTH;
  for (const x of [leftRail, rightRail]) {
    tile.vline(x, top, height, 'gray');
    tile.vline(x + 1, top, height, 'slate');
    for (let y = top + 3; y < top + height; y += 8) {
      tile.hline(x, y, RAIL_WIDTH, 'silver');
    }
  }
}

function drawCables(tile, top, height) {
  for (const x of cableColumns(tile.width)) {
    tile.vline(x, top, height, 'gray');
  }
}

function drawBeam(tile, type) {
  const pattern = STYLES[type].beam;
  for (let x = WALL_WIDTH; x < tile.width - WALL_WIDTH; x++) {
    tile.set(x, BEAM_ROW, pattern[(x - WALL_WIDTH) % pattern.length]);
  }
  tile.hline(WALL_WIDTH, BEAM_ROW + 1, tile.width - 2 * WALL_WIDTH, 'ink');
}

const BRICK_HEIGHT = 4;
const BRICK_LENGTH = 8;

// Brick wall behind the shaft on a level with no structure. Rows
// of bricks offset by half a brick, with a mortar line under each row.
function drawBrickWall(tile) {
  tile.fillRect(0, 0, tile.width, tile.height, 'concrete-dark');
  for (let row = 0; row * BRICK_HEIGHT < tile.height; row++) {
    const top = row * BRICK_HEIGHT;
    const shift = row % 2 === 0 ? 0 : BRICK_LENGTH / 2;
    for (let left = -shift; left < tile.width; left += BRICK_LENGTH) {
      const brick = Math.floor((left + shift) / BRICK_LENGTH);
      const color = (brick + row * 3) % 5 === 0 ? 'wood' : 'skin-dark';
      const from = Math.max(left, 0);
      const to = Math.min(left + BRICK_LENGTH - 1, tile.width);
      tile.fillRect(from, top, to - from, BRICK_HEIGHT - 1, color);
      tile.hline(from, top, to - from, 'wood');
    }
  }
}

// One level of a shaft, drawn under the hall doors and the car. `brick` is for a level with
// no structure behind the shaft; otherwise the back is a flat neutral gray.
function shaftBody(type, backdrop) {
  const tile = new PixelCanvas(shaftWidth(type), floorHeight);
  if (backdrop === 'brick') {
    drawBrickWall(tile);
  } else {
    tile.fillRect(0, 0, tile.width, tile.height, 'slate');
  }
  drawShaftWalls(tile);
  drawGuideRails(tile, 0, tile.height);
  drawCables(tile, 0, tile.height);
  drawBeam(tile, type);
  return tile;
}

function drawSheave(tile, centreX, top) {
  tile.drawMap(centreX - 3, top, ['.GGGG.', 'GSWWSG', 'GWSSWG', 'GWSSWG', 'GSWWSG', '.GGGG.'], {
    G: 'gray',
    S: 'slate',
    W: 'silver',
  });
}

// The machine room above the top level, one full floor tall: the hoist sheave hangs from a
// beam, a motor and a control cabinet stand on a platform, and both cables leave the sheave
// downward.
function shaftTop(type) {
  const tile = new PixelCanvas(shaftWidth(type), TOP_CAP_HEIGHT);
  const centreX = tile.width / 2;
  const [cableLeft, cableRight] = cableColumns(tile.width);
  tile.fillRect(0, 0, tile.width, tile.height, 'charcoal');
  drawShaftWalls(tile);
  tile.hline(0, 0, tile.width, 'silver');
  tile.hline(0, 1, tile.width, 'gray');
  tile.set(tile.width - 1, 0, 'gray');

  const beamTop = 4;
  tile.hline(WALL_WIDTH, beamTop, tile.width - 2 * WALL_WIDTH, 'silver');
  tile.hline(WALL_WIDTH, beamTop + 1, tile.width - 2 * WALL_WIDTH, 'slate');
  tile.vline(centreX - 1, beamTop + 2, 6, 'gray');
  tile.vline(centreX, beamTop + 2, 6, 'slate');
  drawSheave(tile, centreX, SHEAVE_TOP);

  const platformTop = 24;
  const motorLeft = centreX + 5;
  tile.fillRect(motorLeft, 13, 7, platformTop - 13, 'gray');
  tile.hline(motorLeft, 13, 7, 'silver');
  tile.vline(motorLeft + 6, 14, platformTop - 14, 'slate');
  for (let y = 16; y < platformTop - 2; y += 3) {
    tile.hline(motorLeft + 1, y, 4, 'slate');
  }
  tile.set(motorLeft + 3, 15, 'lamp');
  tile.hline(centreX + 3, SHEAVE_TOP + 2, 2, 'slate');

  const cabinetLeft = centreX - 11;
  tile.fillRect(cabinetLeft, 12, 6, platformTop - 12, 'gray');
  tile.hline(cabinetLeft, 12, 6, 'silver');
  tile.vline(cabinetLeft + 5, 13, platformTop - 13, 'slate');
  tile.vline(cabinetLeft + 2, 14, platformTop - 14, 'slate');
  tile.set(cabinetLeft + 1, 15, 'lamp');
  tile.set(cabinetLeft + 1, 17, 'cloth-red');
  tile.set(cabinetLeft + 4, 15, 'lamp-glow');

  tile.hline(WALL_WIDTH, platformTop, tile.width - 2 * WALL_WIDTH, 'silver');
  tile.hline(WALL_WIDTH, platformTop + 1, tile.width - 2 * WALL_WIDTH, 'slate');
  tile.hline(WALL_WIDTH, platformTop + 2, tile.width - 2 * WALL_WIDTH, 'ink');
  drawGuideRails(tile, platformTop + 3, tile.height - platformTop - 3);
  for (const x of [cableLeft, cableRight]) {
    tile.vline(x, SHEAVE_TOP + 1, tile.height - SHEAVE_TOP - 1, 'gray');
  }
  drawBeam(tile, type);
  return tile;
}

function drawBuffer(tile, centre, topRow, baseRow) {
  tile.hline(centre - 3, topRow, 7, 'silver');
  tile.hline(centre - 3, topRow + 1, 7, 'slate');
  for (let y = topRow + 2; y < baseRow; y++) {
    const turn = (y - topRow) % 3 === 0;
    tile.hline(centre - 2, y, 5, turn ? 'silver' : 'slate');
    tile.set(centre - 2, y, 'gray');
    tile.set(centre + 2, y, 'gray');
  }
  tile.hline(centre - 3, baseRow, 7, 'gray');
  tile.hline(centre - 3, baseRow + 1, 7, 'slate');
}

// The pit under the lowest level, one full floor tall: the tension sheave the cables wrap
// around, two spring buffers for the car and a solid concrete base.
function shaftBottom(type) {
  const tile = new PixelCanvas(shaftWidth(type), BOTTOM_CAP_HEIGHT);
  const centreX = tile.width / 2;
  const [cableLeft, cableRight] = cableColumns(tile.width);
  const baseTop = 22;
  tile.fillRect(0, 0, tile.width, tile.height, 'charcoal');
  drawShaftWalls(tile);
  drawGuideRails(tile, 0, baseTop);
  for (const x of [cableLeft, cableRight]) {
    tile.vline(x, 0, PIT_SHEAVE_TOP + 1, 'gray');
  }
  drawSheave(tile, centreX, PIT_SHEAVE_TOP);
  tile.vline(centreX - 1, PIT_SHEAVE_TOP + 6, baseTop - PIT_SHEAVE_TOP - 6, 'gray');
  tile.vline(centreX, PIT_SHEAVE_TOP + 6, baseTop - PIT_SHEAVE_TOP - 6, 'slate');
  tile.hline(centreX - 3, baseTop - 1, 6, 'slate');
  const spread = Math.floor(tile.width / 4);
  drawBuffer(tile, spread, 8, baseTop - 2);
  drawBuffer(tile, tile.width - spread, 8, baseTop - 2);

  tile.fillRect(0, baseTop, tile.width, tile.height - baseTop, 'concrete');
  tile.hline(0, baseTop, tile.width, 'concrete-light');
  tile.hline(0, tile.height - 1, tile.width, 'concrete-dark');
  for (let x = 7; x < tile.width; x += 8) {
    tile.vline(x, baseTop + 1, tile.height - baseTop - 2, 'concrete-dark');
  }
  tile.hline(0, baseTop + 5, tile.width, 'concrete-dark');
  return tile;
}

const DOOR_TOP = 4;
const DOOR_BOTTOM = 28;

function doorOpening(car) {
  return { left: 3, right: car.width - 4, top: DOOR_TOP, bottom: DOOR_BOTTOM };
}

function drawCarFrame(car, type) {
  const { light, base, dark } = STYLES[type].frame;
  car.fillRect(0, 0, car.width, car.height, base);
  car.hline(1, 1, car.width - 2, light);
  car.vline(1, 1, car.height - 2, light);
  car.vline(car.width - 2, 2, car.height - 3, dark);
  car.hline(1, car.height - 2, car.width - 2, dark);
  car.set(car.width / 2 - 1, 2, 'lamp');
  car.set(car.width / 2, 2, 'lamp-glow');
  if (type === 'service') {
    for (let x = 2; x < car.width - 2; x++) {
      car.set(x, car.height - 3, Math.floor(x / 2) % 2 === 0 ? 'lamp' : 'ink');
    }
  }
  if (type === 'express') {
    car.hline(2, 3, car.width - 4, 'lamp');
  }
  car.strokeRect(0, 0, car.width, car.height, 'ink');
}

function drawDoorLeaf(car, left, width, top, height) {
  car.fillRect(left, top, width, height, 'silver');
  car.vline(left, top, height, 'white');
  car.vline(left + width - 1, top, height, 'gray');
  car.hline(left + 1, top + height - 4, width - 2, 'gray');
}

function drawClosedDoors(car, opening) {
  const { left, right, top, bottom } = opening;
  const height = bottom - top + 1;
  const leafWidth = (right - left + 1) / 2;
  drawDoorLeaf(car, left, leafWidth, top, height);
  drawDoorLeaf(car, left + leafWidth, leafWidth, top, height);
  car.vline(left + leafWidth, top, height, 'ink');
}

function drawInterior(car, type, opening) {
  const { left, right, top, bottom } = opening;
  const width = right - left + 1;
  const { base, dark } = STYLES[type].frame;
  car.fillRect(left, top, width, bottom - top + 1, STYLES[type].backWall);
  car.hline(left, top, width, dark);
  const lampLeft = car.width / 2 - 2;
  car.hline(lampLeft, top + 1, 4, 'lamp-glow');
  car.hline(left, top + 11, width, 'silver');
  car.hline(left, top + 12, width, 'gray');
  car.hline(left, bottom - 1, width, base);
  car.hline(left, bottom, width, dark);
  if (type === 'express') {
    for (let x = left + 3; x < right - 1; x += 5) {
      car.vline(x, top + 2, 8, 'wood');
    }
  }
}

function drawOpenDoors(car, type, opening) {
  drawInterior(car, type, opening);
  const { left, right, top, bottom } = opening;
  const height = bottom - top + 1;
  drawDoorLeaf(car, left, 2, top, height);
  drawDoorLeaf(car, right - 1, 2, top, height);
}

// An elevator car, stopped at a floor, with its doors open or closed.
function car(type, doors) {
  const { width, height } = elevatorCar[type];
  const canvas = new PixelCanvas(width, height);
  drawCarFrame(canvas, type);
  const opening = doorOpening(canvas);
  if (doors === 'open') {
    drawOpenDoors(canvas, type, opening);
  } else {
    drawClosedDoors(canvas, opening);
  }
  return canvas;
}

const JAMB_LEFT = WALL_WIDTH;
const HEADER_HEIGHT = 2;

// Closed metal hall doors between the jambs, with a seam in the middle. They show
// whenever the car is on another level.
function drawHallDoors(frame, jambRight) {
  const left = JAMB_LEFT + 2;
  const top = HEADER_HEIGHT;
  const width = jambRight - left;
  const height = BEAM_ROW - HEADER_HEIGHT;
  const leaf = width / 2;
  frame.fillRect(left, top, width, height, 'silver');
  for (const start of [left, left + leaf]) {
    frame.vline(start, top, height, 'white');
    frame.vline(start + leaf - 1, top, height, 'gray');
    frame.hline(start + 1, top + 3, leaf - 2, 'gray');
    frame.hline(start + 1, top + height - 5, leaf - 2, 'gray');
  }
  frame.vline(left + leaf - 1, top, height, 'ink');
  frame.vline(left + leaf, top, height, 'ink');
  frame.hline(left, top + height - 1, width, 'slate');
}

// The hall door frame around the car on every level where the elevator stops.
// It is drawn over the shaft body and under the car, with closed metal doors in it.
function landingFrame(type) {
  const { light, base, dark } = STYLES[type].frame;
  const frame = new PixelCanvas(shaftWidth(type), floorHeight);
  const jambRight = frame.width - WALL_WIDTH - 2;
  const jambHeight = BEAM_ROW;
  frame.hline(JAMB_LEFT, 0, frame.width - 2 * WALL_WIDTH, light);
  frame.hline(JAMB_LEFT, 1, frame.width - 2 * WALL_WIDTH, base);
  frame.vline(JAMB_LEFT, 0, jambHeight, light);
  frame.vline(JAMB_LEFT + 1, HEADER_HEIGHT, jambHeight - HEADER_HEIGHT, base);
  frame.vline(jambRight, HEADER_HEIGHT, jambHeight - HEADER_HEIGHT, base);
  frame.vline(jambRight + 1, 1, jambHeight - 1, dark);
  const middle = frame.width / 2;
  frame.set(middle - 1, 0, 'lamp');
  frame.set(middle, 0, 'lamp');
  drawHallDoors(frame, jambRight);
  drawCables(frame, 0, BEAM_ROW);
  return frame;
}

export const CALL_PANEL_TOP = 12;
const CALL_LIGHTS = {
  idle: { up: false, down: false },
  up: { up: true, down: false },
  down: { up: false, down: true },
  both: { up: true, down: true },
};

// A 3 x 7 call panel with an up and a down button, placed at the right edge of
// the shaft at row CALL_PANEL_TOP. A lit button means a call is waiting.
function callButtons({ up, down }) {
  const panel = new PixelCanvas(3, 7);
  panel.fillRect(0, 0, 3, 7, 'gray');
  panel.strokeRect(0, 0, 3, 7, 'slate');
  panel.set(1, 2, up ? 'lamp-glow' : 'charcoal');
  panel.set(1, 4, down ? 'lamp' : 'charcoal');
  return panel;
}

// Maintenance hatch for the wall of a service shaft: a gray door with hazard stripes.
function serviceHatch() {
  const hatch = new PixelCanvas(10, 14);
  hatch.fillRect(0, 0, 10, 14, 'gray');
  hatch.strokeRect(0, 0, 10, 14, 'ink');
  hatch.vline(1, 1, 12, 'silver');
  for (let y = 2; y < 12; y += 4) {
    hatch.hline(2, y, 7, 'lamp');
    hatch.hline(2, y + 1, 7, 'ink');
  }
  hatch.set(8, 7, 'cloth-red');
  return hatch;
}

const TYPES = ['standard', 'service', 'express'];
const TIMES = ['day', 'night'];

function frameNumber(frame) {
  return String(frame + 1).padStart(2, '0');
}

function byTime(dayCanvas, time) {
  return time === 'day' ? dayCanvas : toNight(dayCanvas);
}

function elevatorSprites() {
  return TYPES.flatMap((type) => [
    { id: `transport/${type}-shaft/body`, canvas: shaftBody(type, 'plain') },
    { id: `transport/${type}-shaft/brick`, canvas: shaftBody(type, 'brick') },
    { id: `transport/${type}-shaft/top`, canvas: shaftTop(type) },
    { id: `transport/${type}-shaft/bottom`, canvas: shaftBottom(type) },
    { id: `transport/${type}-shaft/landing`, canvas: landingFrame(type) },
    { id: `transport/${type}-car/open`, canvas: car(type, 'open') },
    { id: `transport/${type}-car/closed`, canvas: car(type, 'closed') },
  ]);
}

function callButtonSprites() {
  return Object.entries(CALL_LIGHTS).map(([state, lights]) => ({
    id: `transport/call-button/${state}`,
    canvas: callButtons(lights),
  }));
}

function walkwaySprites() {
  const stairs = drawStairs();
  const escalatorFrames = Array.from({ length: ESCALATOR_FRAMES }, (_, frame) =>
    drawEscalator(frame),
  );
  return TIMES.flatMap((time) => [
    { id: `transport/stairs/${time}`, canvas: byTime(stairs, time) },
    ...escalatorFrames.map((canvas, frame) => ({
      id: `transport/escalator/${time}_${frameNumber(frame)}`,
      canvas: byTime(canvas, time),
    })),
  ]);
}

export const transportGroup = {
  name: 'transport',
  draw() {
    return [
      ...elevatorSprites(),
      { id: 'transport/service-shaft/hatch', canvas: serviceHatch() },
      ...callButtonSprites(),
      ...walkwaySprites(),
    ];
  },
};
