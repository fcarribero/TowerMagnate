import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { colorIndex } from '../src/palette.mjs';
import { skyGroup } from '../src/groups/sky.mjs';
import { structureGroup } from '../src/groups/structure.mjs';
import { metrics } from '../src/metrics.mjs';

function spritesById(group) {
  const [{ sprites }] = drawGroups([group]);
  return Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
}

describe('structure group', () => {
  const sprites = spritesById(structureGroup);

  it('draws a bare floor tile for day and night', () => {
    expect(Object.keys(sprites)).toEqual(['structure/floor/day', 'structure/floor/night']);
    for (const tile of Object.values(sprites)) {
      expect(tile.width).toBe(metrics.tileWidth);
      expect(tile.height).toBe(metrics.floorHeight);
    }
  });

  it('puts the slab on the bottom rows and darkens it at night', () => {
    const slabTop = metrics.floorHeight - metrics.slabHeight;
    expect(sprites['structure/floor/day'].get(0, slabTop)).toBe(colorIndex('concrete-light'));
    expect(sprites['structure/floor/night'].get(0, slabTop)).toBe(colorIndex('concrete'));
    expect(sprites['structure/floor/day'].get(0, slabTop - 1)).toBe(colorIndex('silver'));
  });
});

describe('sky group', () => {
  const sprites = spritesById(skyGroup);

  it('draws three bands for day and night, one floor tall', () => {
    expect(Object.keys(sprites)).toHaveLength(6);
    for (const tile of Object.values(sprites)) {
      expect(tile.height).toBe(metrics.floorHeight);
    }
  });

  it('dithers the bottom of a band into the next sky color', () => {
    const top = sprites['sky/day/top'];
    const bottom = metrics.floorHeight - 1;
    expect(top.get(0, 0)).toBe(colorIndex('sky-deep'));
    expect([top.get(0, bottom), top.get(2, bottom)].sort()).toEqual(
      [colorIndex('sky-deep'), colorIndex('sky')].sort(),
    );
  });
});
