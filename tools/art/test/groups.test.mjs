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
  const ids = Object.keys(sprites);
  const subjects = [...new Set(ids.map((id) => id.split('/')[1]))];

  it('draws every structure subject for day and night', () => {
    expect(subjects).toEqual(
      expect.arrayContaining([
        'floor',
        'lobby-1',
        'lobby-2',
        'lobby-3',
        'sky-lobby',
        'basement',
        'ground',
        'dirt',
        'edge-left',
        'edge-right',
        'roof',
      ]),
    );
    for (const subject of subjects) {
      expect(ids).toContain(`structure/${subject}/day`);
      expect(ids).toContain(`structure/${subject}/night`);
    }
  });

  it('makes floor tiles one tile wide and lobbies 1 to 3 floors tall', () => {
    expect(sprites['structure/floor/day'].width).toBe(metrics.tileWidth);
    expect(sprites['structure/floor/day'].height).toBe(metrics.floorHeight);
    for (const floors of [1, 2, 3]) {
      for (const subject of [`lobby-${floors}`, `lobby-${floors}-column`]) {
        expect(sprites[`structure/${subject}/day`].width).toBe(metrics.tileWidth);
        expect(sprites[`structure/${subject}/day`].height).toBe(floors * metrics.floorHeight);
      }
    }
  });

  it('puts the slab on the bottom rows and darkens it at night', () => {
    const slabTop = metrics.floorHeight - metrics.slabHeight;
    expect(sprites['structure/floor/day'].get(0, slabTop)).toBe(colorIndex('concrete-light'));
    expect(sprites['structure/floor/night'].get(0, slabTop)).toBe(colorIndex('concrete'));
    expect(sprites['structure/floor/day'].get(0, 10)).toBe(colorIndex('silver'));
  });

  it('turns lobby glass dark and the lamps on at night', () => {
    const day = sprites['structure/lobby-2/day'];
    const night = sprites['structure/lobby-2/night'];
    expect(day.get(3, 20)).toBe(colorIndex('glass'));
    expect(night.get(3, 20)).toBe(colorIndex('night'));
    expect(night.get(3, 4)).toBe(colorIndex('lamp-glow'));
  });

  it('fills the whole tile on every opaque structure sprite', () => {
    for (const [id, tile] of Object.entries(sprites)) {
      expect(tile.pixels.includes(0), id).toBe(false);
    }
  });
});

describe('sky group', () => {
  const sprites = spritesById(skyGroup);

  it('draws three bands for day, dusk and night, one floor tall', () => {
    for (const time of ['day', 'dusk', 'night']) {
      for (const band of ['top', 'middle', 'horizon']) {
        expect(sprites[`sky/${time}/${band}`].height).toBe(metrics.floorHeight);
      }
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

  it('scatters stars over the night sky only', () => {
    const star = colorIndex('cloud');
    expect(sprites['sky/night/top'].pixels.includes(star)).toBe(true);
    expect(sprites['sky/day/top'].pixels.includes(star)).toBe(false);
  });

  it('draws a distant skyline and clouds for each time of day', () => {
    for (const time of ['day', 'dusk', 'night']) {
      for (const subject of ['skyline', 'hills', 'cloud-a', 'cloud-b']) {
        expect(sprites[`sky/${subject}/${time}`], `${subject} ${time}`).toBeDefined();
      }
    }
    expect(sprites['sky/night/top'].pixels.includes(colorIndex('lamp'))).toBe(false);
    expect(sprites['sky/skyline/night'].pixels.includes(colorIndex('lamp'))).toBe(true);
  });

  it('keeps the skyline seamless when repeated sideways', () => {
    const skyline = sprites['sky/skyline/day'];
    expect(skyline.width % 8).toBe(0);
    const bottom = skyline.height - 1;
    expect(skyline.get(0, bottom)).not.toBe(0);
    expect(skyline.get(skyline.width - 1, bottom)).not.toBe(0);
  });
});
