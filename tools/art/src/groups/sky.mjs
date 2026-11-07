import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

const TILE_WIDTH = 32;
const DITHER_ROWS = 4;

// Each band fades into the color of the band below it through a 2 x 2 checker.
const bands = {
  day: {
    top: ['sky-deep', 'sky'],
    middle: ['sky', 'sky-light'],
    horizon: ['sky-light', 'sky-light'],
  },
  night: {
    top: ['night-deep', 'night'],
    middle: ['night', 'night'],
    horizon: ['night', 'night'],
  },
};

function skyBand(color, nextColor) {
  const height = metrics.floorHeight;
  const tile = new PixelCanvas(TILE_WIDTH, height);
  tile.fillRect(0, 0, TILE_WIDTH, height, color);
  for (let y = height - DITHER_ROWS; y < height; y++) {
    for (let x = 0; x < TILE_WIDTH; x++) {
      const isNextColorSquare = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      if (isNextColorSquare) {
        tile.set(x, y, nextColor);
      }
    }
  }
  return tile;
}

export const skyGroup = {
  name: 'sky',
  draw() {
    const sprites = [];
    for (const [time, timeBands] of Object.entries(bands)) {
      for (const [band, [color, nextColor]] of Object.entries(timeBands)) {
        sprites.push({ id: `sky/${time}/${band}`, canvas: skyBand(color, nextColor) });
      }
    }
    return sprites;
  },
};
