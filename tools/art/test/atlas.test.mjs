import { describe, expect, it } from 'vitest';
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

describe('atlas packer', () => {
  it('places every sprite inside the atlas without overlaps', () => {
    const packed = packSprites(sample, { maxWidth: 256, padding: 1 });
    expect(packed.placements).toHaveLength(sample.length);
    for (const placement of packed.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(1);
      expect(placement.y).toBeGreaterThanOrEqual(1);
      expect(placement.x + placement.canvas.width).toBeLessThanOrEqual(packed.width - 1);
      expect(placement.y + placement.canvas.height).toBeLessThanOrEqual(packed.height - 1);
    }
    for (let i = 0; i < packed.placements.length; i++) {
      for (let j = i + 1; j < packed.placements.length; j++) {
        expect(overlaps(packed.placements[i], packed.placements[j])).toBe(false);
      }
    }
  });

  it('gives the same result for any input order', () => {
    const forward = atlasJson(packSprites(sample, { maxWidth: 256 }), 'units.png');
    const reversed = atlasJson(packSprites([...sample].reverse(), { maxWidth: 256 }), 'units.png');
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });

  it('rejects duplicate ids and sprites wider than the atlas', () => {
    expect(() => packSprites([sample[0], sample[0]])).toThrow(/Duplicate sprite id/);
    expect(() => packSprites([solidSprite('wide', 300, 8)], { maxWidth: 256 })).toThrow(
      /more than the atlas width/,
    );
  });

  it('renders each sprite at its frame', () => {
    const sprites = [solidSprite('a', 2, 2, 'lamp'), solidSprite('b', 3, 1, 'leaf')];
    const packed = packSprites(sprites, { maxWidth: 16 });
    const atlas = renderAtlas(packed);
    const json = atlasJson(packed, 'test.png');
    for (const { id, canvas } of sprites) {
      const { x, y } = json.frames[id].frame;
      expect(atlas.get(x, y)).toBe(canvas.get(0, 0));
      expect(atlas.get(x - 1, y)).toBe(0);
    }
  });

  it('writes json in the PixiJS spritesheet hash format', () => {
    const json = atlasJson(packSprites(sample, { maxWidth: 256 }), 'units.png');
    const office = json.frames['units/office/occupied_day'];
    expect(Object.keys(office).sort()).toEqual([
      'frame',
      'rotated',
      'sourceSize',
      'spriteSourceSize',
      'trimmed',
    ]);
    expect(office.sourceSize).toEqual({ w: 72, h: 32 });
    expect(json.meta.image).toBe('units.png');
    expect(json.meta.scale).toBe(1);
    expect(json.animations).toEqual({
      'people/worker-a/walk': ['people/worker-a/walk_01', 'people/worker-a/walk_02'],
    });
  });
});
