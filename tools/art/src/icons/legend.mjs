import { PixelCanvas } from '../canvas.mjs';

export const ICON_SIZE = 16;

export const LEGEND = {
  k: 'ink',
  h: 'charcoal',
  d: 'slate',
  g: 'gray',
  s: 'silver',
  c: 'cloud',
  w: 'white',
  O: 'concrete-dark',
  o: 'concrete',
  L: 'concrete-light',
  N: 'wood-dark',
  n: 'wood',
  m: 'wood-light',
  P: 'sky-deep',
  p: 'sky',
  q: 'sky-light',
  a: 'glass',
  u: 'dusk',
  y: 'lamp',
  Y: 'lamp-glow',
  E: 'leaf-dark',
  e: 'leaf',
  r: 'cloth-red',
  b: 'cloth-blue',
  S: 'skin-mid',
  T: 'skin-light',
};

// Draws a 16 x 16 icon from rows of characters. '.' is transparent.
export function drawIcon(id, rows) {
  const wrongRow = rows.findIndex((row) => row.length !== ICON_SIZE);
  if (rows.length !== ICON_SIZE || wrongRow !== -1) {
    throw new Error(`Icon ${id} is not ${ICON_SIZE} x ${ICON_SIZE} (check row ${wrongRow + 1})`);
  }
  const canvas = new PixelCanvas(ICON_SIZE, ICON_SIZE);
  canvas.drawMap(0, 0, rows, LEGEND);
  return { id, canvas };
}
