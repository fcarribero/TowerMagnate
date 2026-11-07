import { readFileSync } from 'node:fs';

const paletteUrl = new URL('../palette.json', import.meta.url);
const paletteFile = JSON.parse(readFileSync(paletteUrl, 'utf8'));

function hexToRgba(hex) {
  if (hex === null) {
    return [0, 0, 0, 0];
  }
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return [red, green, blue, 255];
}

export const paletteName = paletteFile.name;

export const colors = paletteFile.colors.map((color, index) => ({
  index,
  id: color.id,
  hex: color.hex,
  use: color.use,
  rgba: hexToRgba(color.hex),
}));

const indexById = new Map(colors.map((color) => [color.id, color.index]));

export function colorIndex(id) {
  const index = indexById.get(id);
  if (index === undefined) {
    throw new Error(`Unknown palette color: ${id}`);
  }
  return index;
}

export function colorRgba(indexOrId) {
  const index = typeof indexOrId === 'string' ? colorIndex(indexOrId) : indexOrId;
  const color = colors[index];
  if (color === undefined) {
    throw new Error(`Palette index out of range: ${index}`);
  }
  return color.rgba;
}
