import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '../src/palette.mjs';
import { encodePng } from '../src/png.mjs';

const COLUMNS = 8;
const CELL = 32;
const GAP = 4;
const BACKGROUND = [0x14, 0x12, 0x18, 255];
const CHECKER_LIGHT = [0xd6, 0xd4, 0xd0, 255];
const CHECKER_DARK = [0xa9, 0xa8, 0xb0, 255];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] ?? resolve(scriptDir, '../../../docs/art/palette-swatch.png');

const rows = Math.ceil(colors.length / COLUMNS);
const width = GAP + COLUMNS * (CELL + GAP);
const height = GAP + rows * (CELL + GAP);
const pixels = new Uint8Array(width * height * 4);

function setPixel(x, y, rgba) {
  pixels.set(rgba, (y * width + x) * 4);
}

function fillRect(left, top, rectWidth, rectHeight, pickColor) {
  for (let y = top; y < top + rectHeight; y++) {
    for (let x = left; x < left + rectWidth; x++) {
      setPixel(x, y, pickColor(x - left, y - top));
    }
  }
}

function checker(x, y) {
  const isLightSquare = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
  return isLightSquare ? CHECKER_LIGHT : CHECKER_DARK;
}

fillRect(0, 0, width, height, () => BACKGROUND);

for (const color of colors) {
  const left = GAP + (color.index % COLUMNS) * (CELL + GAP);
  const top = GAP + Math.floor(color.index / COLUMNS) * (CELL + GAP);
  const isTransparent = color.rgba[3] === 0;
  fillRect(left, top, CELL, CELL, (x, y) => (isTransparent ? checker(x, y) : color.rgba));
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, encodePng(width, height, pixels));
console.log(`Wrote ${outputPath} (${width}x${height}, ${colors.length} colors)`);
