import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atlasJson, packSprites, renderAtlas } from '../src/atlas.mjs';
import { PixelCanvas } from '../src/canvas.mjs';

function solidSprite(id, width, height, color = 'ink') {
  const canvas = new PixelCanvas(width, height);
  canvas.fillRect(0, 0, width, height, color);
  return { id, canvas };
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.canvas.width &&
    b.x < a.x + a.canvas.width &&
    a.y < b.y + b.canvas.height &&
    b.y < a.y + a.canvas.height
  );
}

const sample = [
  solidSprite('units/office/occupied_day', 72, 32),
  solidSprite('people/worker-a/walk_02', 8, 16),
  solidSprite('people/worker-a/walk_01', 8, 16),
  solidSprite('units/cinema/occupied_day', 248, 64),
  solidSprite('ui/tool-bulldozer', 16, 16),
];

test('places every sprite inside the atlas without overlaps', () => {
  const packed = packSprites(sample, { maxWidth: 256, padding: 1 });
  assert.equal(packed.placements.length, sample.length);
  for (const placement of packed.placements) {
    assert.ok(placement.x >= 1 && placement.y >= 1);
    assert.ok(placement.x + placement.canvas.width <= packed.width - 1);
    assert.ok(placement.y + placement.canvas.height <= packed.height - 1);
  }
  for (let i = 0; i < packed.placements.length; i++) {
    for (let j = i + 1; j < packed.placements.length; j++) {
      assert.ok(!overlaps(packed.placements[i], packed.placements[j]));
    }
  }
});

test('input order does not change the result', () => {
  const forward = atlasJson(packSprites(sample, { maxWidth: 256 }), 'units.png');
  const reversed = atlasJson(packSprites([...sample].reverse(), { maxWidth: 256 }), 'units.png');
  assert.deepEqual(forward, reversed);
  assert.equal(JSON.stringify(forward), JSON.stringify(reversed));
});

test('rejects duplicate ids and sprites wider than the atlas', () => {
  assert.throws(() => packSprites([sample[0], sample[0]]), /Duplicate sprite id/);
  assert.throws(() => packSprites([solidSprite('wide', 300, 8)], { maxWidth: 256 }), /more than the atlas width/);
});

test('rendered atlas holds each sprite at its frame', () => {
  const sprites = [solidSprite('a', 2, 2, 'lamp'), solidSprite('b', 3, 1, 'leaf')];
  const packed = packSprites(sprites, { maxWidth: 16 });
  const atlas = renderAtlas(packed);
  const json = atlasJson(packed, 'test.png');
  for (const { id, canvas } of sprites) {
    const { x, y } = json.frames[id].frame;
    assert.equal(atlas.get(x, y), canvas.get(0, 0));
    assert.equal(atlas.get(x - 1, y), 0);
  }
});

test('json follows the PixiJS spritesheet hash format', () => {
  const json = atlasJson(packSprites(sample, { maxWidth: 256 }), 'units.png');
  const office = json.frames['units/office/occupied_day'];
  assert.deepEqual(Object.keys(office).sort(), ['frame', 'rotated', 'sourceSize', 'spriteSourceSize', 'trimmed']);
  assert.deepEqual(office.sourceSize, { w: 72, h: 32 });
  assert.equal(json.meta.image, 'units.png');
  assert.equal(json.meta.scale, 1);
  assert.deepEqual(json.animations, {
    'people/worker-a/walk': ['people/worker-a/walk_01', 'people/worker-a/walk_02'],
  });
});
