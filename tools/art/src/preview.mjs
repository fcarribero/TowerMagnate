import { PixelCanvas } from './canvas.mjs';
import { metrics } from './metrics.mjs';

const SCENE_TILES = 24;
const TOWER_FIRST_TILE = 6;
const TOWER_TILES = 12;
const COLUMN_EVERY = 4;
const LEVEL_ROWS = 17;
const FIRST_BASEMENT_ROW = 7;
const TUNNEL_LAMP_EVERY = 4;

// Soil subject for basement levels S1 to S9; S10 is the subway tunnel.
const SOIL_BY_BASEMENT = [
  'ground',
  'dirt',
  'dirt',
  'clay',
  'clay',
  'clay',
  'dirt-deep',
  'dirt-deep',
  'bedrock',
];
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
    const lamp = tile % TUNNEL_LAMP_EVERY === 2 ? '-lamp' : '';
    scene.stamp(
      sprite(`structure/subway-tunnel${lamp}/${unitTime}`),
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
    scene.stamp(sprite(`structure/ruler${hover}/${unitTime}`), 0, row * floor);
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
