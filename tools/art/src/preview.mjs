import { PixelCanvas } from './canvas.mjs';
import { metrics } from './metrics.mjs';

const SCENE_TILES = 24;
const TOWER_FIRST_TILE = 6;
const TOWER_TILES = 12;
const COLUMN_EVERY = 4;
const LEVEL_ROWS = 11;
const GAP = 4;

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
// with a sky lobby, a bare floor and a two-floor lobby, then basement and soil.
export function drawStructureScene(sprites, time) {
  const sprite = (id) => sprites[id];
  const floor = metrics.floorHeight;
  const scene = new PixelCanvas(SCENE_TILES * metrics.tileWidth, LEVEL_ROWS * floor);
  const towerLeft = TOWER_FIRST_TILE * metrics.tileWidth;
  const towerRight = towerLeft + TOWER_TILES * metrics.tileWidth;
  const groundY = 7 * floor;
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

  tileAcross(scene, sprite(`structure/ground/${unitTime}`), groundY);
  tileAcross(scene, sprite(`structure/dirt/${unitTime}`), 8 * floor);
  tileAcross(scene, sprite(`structure/dirt/${unitTime}`), 9 * floor);
  tileAcross(scene, sprite(`structure/dirt-deep/${unitTime}`), 10 * floor);

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
