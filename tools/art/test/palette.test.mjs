import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorIndex, colorRgba, colors } from '../src/palette.mjs';

test('palette has 32 slots with transparent at index 0', () => {
  assert.equal(colors.length, 32);
  assert.equal(colors[0].id, 'clear');
  assert.deepEqual(colors[0].rgba, [0, 0, 0, 0]);
});

test('every opaque color has a unique #rrggbb hex and a unique id', () => {
  const opaque = colors.slice(1);
  for (const color of opaque) {
    assert.match(color.hex, /^#[0-9a-f]{6}$/);
    assert.equal(color.rgba[3], 255);
  }
  assert.equal(new Set(opaque.map((color) => color.hex)).size, opaque.length);
  assert.equal(new Set(colors.map((color) => color.id)).size, colors.length);
});

test('colors are looked up by id or index', () => {
  assert.equal(colorIndex('ink'), 1);
  assert.deepEqual(colorRgba('ink'), [0x14, 0x12, 0x18, 255]);
  assert.deepEqual(colorRgba(1), colorRgba('ink'));
  assert.throws(() => colorIndex('magenta'), /Unknown palette color/);
  assert.throws(() => colorRgba(99), /out of range/);
});
