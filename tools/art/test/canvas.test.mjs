import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PixelCanvas } from '../src/canvas.mjs';
import { colorIndex, colorRgba } from '../src/palette.mjs';

test('starts clear and draws rectangles by color id', () => {
  const canvas = new PixelCanvas(4, 3);
  assert.equal(canvas.get(0, 0), 0);
  canvas.fillRect(1, 1, 2, 2, 'wood');
  assert.equal(canvas.get(1, 1), colorIndex('wood'));
  assert.equal(canvas.get(2, 2), colorIndex('wood'));
  assert.equal(canvas.get(0, 1), 0);
});

test('ignores pixels outside the canvas', () => {
  const canvas = new PixelCanvas(2, 2);
  canvas.fillRect(-1, -1, 5, 5, 'ink');
  assert.deepEqual([...canvas.pixels], [1, 1, 1, 1]);
  assert.equal(canvas.get(9, 9), 0);
});

test('rejects colors outside the palette', () => {
  const canvas = new PixelCanvas(2, 2);
  assert.throws(() => canvas.set(0, 0, 'magenta'), /Unknown palette color/);
  assert.throws(() => canvas.set(0, 0, 40), /Not a palette color/);
});

test('strokeRect draws only the border', () => {
  const canvas = new PixelCanvas(3, 3);
  canvas.strokeRect(0, 0, 3, 3, 'ink');
  assert.equal(canvas.get(1, 1), 0);
  assert.equal(canvas.get(2, 1), colorIndex('ink'));
});

test('drawMap uses the legend and skips dots', () => {
  const canvas = new PixelCanvas(3, 2);
  canvas.drawMap(0, 0, ['a.b', 'bb.'], { a: 'ink', b: 'lamp' });
  assert.deepEqual([...canvas.pixels], [1, 0, 21, 21, 21, 0]);
});

test('stamp keeps the destination where the source is clear', () => {
  const base = new PixelCanvas(2, 1);
  base.fillRect(0, 0, 2, 1, 'sky');
  const top = new PixelCanvas(2, 1);
  top.set(1, 0, 'ink');
  base.stamp(top, 0, 0);
  assert.deepEqual([...base.pixels], [colorIndex('sky'), colorIndex('ink')]);
});

test('recolor returns a new canvas and leaves the original alone', () => {
  const canvas = new PixelCanvas(2, 1);
  canvas.set(0, 0, 'cloth-blue');
  canvas.set(1, 0, 'skin-mid');
  const stressed = canvas.recolor({ 'cloth-blue': 'stress-red' });
  assert.equal(stressed.get(0, 0), colorIndex('stress-red'));
  assert.equal(stressed.get(1, 0), colorIndex('skin-mid'));
  assert.equal(canvas.get(0, 0), colorIndex('cloth-blue'));
});

test('toRgba expands indices to palette colors', () => {
  const canvas = new PixelCanvas(2, 1);
  canvas.set(1, 0, 'lamp');
  assert.deepEqual([...canvas.toRgba()], [0, 0, 0, 0, ...colorRgba('lamp')]);
});
