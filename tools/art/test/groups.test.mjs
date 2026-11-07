import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { colorIndex } from '../src/palette.mjs';
import { skyGroup } from '../src/groups/sky.mjs';
import { structureGroup } from '../src/groups/structure.mjs';
import { transportGroup } from '../src/groups/transport.mjs';
import { uiGroup } from '../src/groups/ui.mjs';
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

  it('draws soil strata as wide tiles one level tall', () => {
    for (const subject of ['ground', 'dirt', 'clay', 'dirt-deep', 'bedrock']) {
      expect(sprites[`structure/${subject}/day`].width, subject).toBe(32);
      expect(sprites[`structure/${subject}/day`].height, subject).toBe(metrics.floorHeight);
    }
  });

  it('draws the subway tunnel one tile wide with rails and a lit lamp', () => {
    for (const subject of ['subway-tunnel', 'subway-tunnel-lamp']) {
      expect(sprites[`structure/${subject}/day`].width).toBe(metrics.tileWidth);
      expect(sprites[`structure/${subject}/day`].height).toBe(metrics.floorHeight);
    }
    expect(sprites['structure/subway-tunnel/day'].get(0, 24)).toBe(colorIndex('silver'));
    expect(sprites['structure/subway-tunnel-lamp/night'].get(3, 5)).toBe(colorIndex('lamp'));
    expect(sprites['structure/subway-tunnel/day'].pixels.includes(colorIndex('lamp'))).toBe(false);
  });

  it('closes the subway tunnel with a bulkhead on the outer side', () => {
    const left = sprites['structure/subway-tunnel-edge-left/day'];
    const right = sprites['structure/subway-tunnel-edge-right/day'];
    expect(left.width).toBe(metrics.tileWidth);
    expect(left.get(0, 10)).toBe(colorIndex('concrete-light'));
    expect(right.get(metrics.tileWidth - 1, 10)).toBe(colorIndex('concrete-dark'));
    expect(right.get(0, 24)).toBe(colorIndex('silver'));
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

  it('repeats the middle band without a seam across floors and columns', () => {
    for (const time of ['day', 'dusk', 'night']) {
      const middle = sprites[`sky/${time}/middle`];
      const tiled = (x, y) => middle.get(x % middle.width, y % middle.height);
      for (let y = 0; y < middle.height; y++) {
        for (let x = 0; x < middle.width; x++) {
          const crossesRight = tiled(x + 8, y) === middle.get(x, y);
          const crossesDown = tiled(x, y + 16) === middle.get(x, y);
          if (time !== 'night') {
            expect(crossesRight && crossesDown, `${time} at ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('mixes both middle colors evenly over the whole tile', () => {
    const middle = sprites['sky/day/middle'];
    const topHalf = middle.pixels.slice(0, middle.pixels.length / 2);
    const bottomHalf = middle.pixels.slice(middle.pixels.length / 2);
    const flecks = (pixels) => pixels.filter((pixel) => pixel === colorIndex('sky-light')).length;
    expect(flecks(topHalf)).toBeGreaterThan(0);
    expect(flecks(topHalf)).toBe(flecks(bottomHalf));
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

describe('transport group', () => {
  const sprites = spritesById(transportGroup);
  const types = ['standard', 'service', 'express'];

  it('draws shaft body and caps, 4 tiles wide for standard and service and 6 for express', () => {
    const tiles = { standard: 4, service: 4, express: 6 };
    for (const type of types) {
      for (const part of ['body', 'top', 'bottom']) {
        const shaft = sprites[`transport/${type}-shaft/${part}`];
        expect(shaft.width, `${type} ${part}`).toBe(tiles[type] * metrics.tileWidth);
      }
      expect(sprites[`transport/${type}-shaft/body`].height).toBe(metrics.floorHeight);
    }
  });

  it('draws each car with doors open and closed at the metrics size', () => {
    for (const type of types) {
      for (const doors of ['open', 'closed']) {
        const car = sprites[`transport/${type}-car/${doors}`];
        expect(car.width, `${type} ${doors}`).toBe(metrics.elevatorCar[type].width);
        expect(car.height, `${type} ${doors}`).toBe(metrics.elevatorCar[type].height);
        expect(car.get(0, 0)).toBe(colorIndex('ink'));
      }
    }
  });

  it('fits each car inside its shaft with room for the rails', () => {
    for (const type of types) {
      const shaft = sprites[`transport/${type}-shaft/body`];
      expect(shaft.width - sprites[`transport/${type}-car/closed`].width).toBe(8);
    }
  });

  it('shows the closed door seam and the lit interior when open', () => {
    const closed = sprites['transport/standard-car/closed'];
    const open = sprites['transport/standard-car/open'];
    const middle = closed.width / 2;
    expect(closed.get(middle, 14)).toBe(colorIndex('ink'));
    expect(open.get(middle, 14)).toBe(colorIndex('cloud'));
    expect(open.pixels.includes(colorIndex('lamp-glow'))).toBe(true);
  });
});

describe('ui group', () => {
  const sprites = spritesById(uiGroup);

  it('draws the ruler background one level tall and a plate that lights up on hover', () => {
    expect(sprites['ui/ruler-background'].height).toBe(metrics.floorHeight);
    expect(sprites['ui/ruler-plate'].get(8, 6)).toBe(colorIndex('cloud'));
    expect(sprites['ui/ruler-plate-hover'].get(8, 6)).toBe(colorIndex('lamp'));
    expect(sprites['ui/ruler-plate'].get(0, 0)).toBe(colorIndex('ink'));
  });
});
