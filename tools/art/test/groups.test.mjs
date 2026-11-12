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

  it('fades the bottom of the top band into the next sky color and ends solid', () => {
    const top = sprites['sky/day/top'];
    const bottom = metrics.floorHeight - 1;
    expect(top.get(0, 0)).toBe(colorIndex('sky-deep'));
    for (let x = 0; x < top.width; x++) {
      expect(top.get(x, bottom)).toBe(colorIndex('sky'));
    }
  });

  it('tiles the top band into the middle band without a seam, day and night', () => {
    for (const time of ['day', 'night']) {
      const top = sprites[`sky/${time}/top`];
      const middle = sprites[`sky/${time}/middle`];
      const bottom = metrics.floorHeight - 1;
      expect(top.width % 4, time).toBe(0);
      for (let x = 0; x < top.width; x++) {
        expect(top.get(x, bottom), `${time} at ${x}`).toBe(middle.get(0, 0));
        expect(top.get(x, bottom - 3), `${time} at ${x}`).toBe(
          top.get((x + 4) % top.width, bottom - 3),
        );
      }
    }
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

describe('transport walkways and landings', () => {
  const sprites = spritesById(transportGroup);
  const types = ['standard', 'service', 'express'];

  it('draws stairs and escalators 8 tiles wide and one level tall, day and night', () => {
    for (const time of ['day', 'night']) {
      const ids = [`transport/stairs/${time}`];
      for (let frame = 1; frame <= 4; frame++) {
        ids.push(`transport/escalator/${time}_0${frame}`);
      }
      for (const id of ids) {
        expect(sprites[id].width, id).toBe(8 * metrics.tileWidth);
        expect(sprites[id].height, id).toBe(metrics.floorHeight);
      }
    }
  });

  it('starts the flight on the floor at the left and reaches the level above at the right', () => {
    const stairs = sprites['transport/stairs/day'];
    const floorRow = metrics.floorHeight - metrics.slabHeight - 1;
    expect(stairs.get(5, floorRow)).not.toBe(0);
    expect(stairs.get(stairs.width - 6, 1)).not.toBe(0);
    for (let row = floorRow + 1; row < metrics.floorHeight; row++) {
      expect(stairs.get(5, row)).toBe(0);
    }
  });

  it('animates the escalator steps over four distinct frames that loop', () => {
    const frames = [1, 2, 3, 4].map((frame) => sprites[`transport/escalator/day_0${frame}`]);
    const keys = frames.map((frame) => frame.pixels.join(','));
    expect(new Set(keys).size).toBe(4);
  });

  it('turns escalator glass dark at night', () => {
    const day = sprites['transport/escalator/day_01'];
    const night = sprites['transport/escalator/night_01'];
    expect(day.pixels.includes(colorIndex('glass'))).toBe(true);
    expect(night.pixels.includes(colorIndex('glass'))).toBe(false);
    expect(night.pixels.includes(colorIndex('night'))).toBe(true);
  });

  it('frames each landing as wide as its shaft and leaves the car opening clear', () => {
    for (const type of types) {
      const landing = sprites[`transport/${type}-shaft/landing`];
      const shaft = sprites[`transport/${type}-shaft/body`];
      expect(landing.width, type).toBe(shaft.width);
      expect(landing.height, type).toBe(metrics.floorHeight);
      expect(landing.get(landing.width / 2, 14), type).toBe(0);
      expect(landing.get(2, 14), type).not.toBe(0);
    }
  });

  it('lights the call buttons for each waiting direction', () => {
    const lit = (state, row) =>
      [colorIndex('lamp'), colorIndex('lamp-glow')].includes(
        sprites[`transport/call-button/${state}`].get(1, row),
      );
    expect([lit('idle', 2), lit('idle', 4)]).toEqual([false, false]);
    expect([lit('up', 2), lit('up', 4)]).toEqual([true, false]);
    expect([lit('down', 2), lit('down', 4)]).toEqual([false, true]);
    expect([lit('both', 2), lit('both', 4)]).toEqual([true, true]);
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

  it('draws every icon at 16 x 16 with an ink stroke, except the lock badge and the empty star', () => {
    const icons = Object.entries(sprites).filter(([id]) => !id.startsWith('ui/ruler'));
    const outlined = icons.filter(([id]) => id !== 'ui/star-empty');
    expect(icons.length).toBeGreaterThan(0);
    for (const [id, icon] of icons) {
      const expectedSize = id === 'ui/lock' ? [8, 8] : [16, 16];
      expect([icon.width, icon.height], id).toEqual(expectedSize);
    }
    for (const [id, icon] of outlined) {
      expect(icon.pixels.includes(colorIndex('obra-ink')), id).toBe(true);
    }
  });

  it('keeps tower palette colors out of every icon', () => {
    const towerSlots = 32;
    const icons = Object.entries(sprites).filter(([id]) => !id.startsWith('ui/ruler'));
    for (const [id, icon] of icons) {
      expect(
        icon.pixels.every((index) => index === 0 || index >= towerSlots),
        id,
      ).toBe(true);
    }
  });

  it('draws the fixed tool, category and status icons', () => {
    const expected = [
      ...['inspect', 'bulldozer', 'car'].map((tool) => `ui/tool-${tool}`),
      ...[
        'structure',
        'transport',
        'offices-and-housing',
        'hotel',
        'commerce-and-entertainment',
        'services',
      ].map((category) => `ui/cat-${category}`),
      'ui/star-full',
      'ui/star-empty',
      'ui/money',
      'ui/population',
      'ui/alarm',
      'ui/lock',
      ...['map', 'finances', 'followed', 'news'].map((window) => `ui/window-${window}`),
    ];
    for (const id of expected) {
      expect(sprites[id], id).toBeDefined();
    }
  });

  it('draws a filled star in ink and an empty star in muted with a clear middle', () => {
    expect(sprites['ui/star-full'].get(8, 8)).toBe(colorIndex('obra-ink'));
    expect(sprites['ui/star-empty'].get(8, 8)).toBe(0);
    expect(sprites['ui/star-empty'].pixels.includes(colorIndex('obra-muted'))).toBe(true);
  });

  it('draws an icon for each of the 25 catalog units', () => {
    const units = [
      'floor',
      'lobby',
      'stairs',
      'escalator',
      'standard-elevator',
      'office',
      'condo',
      'fast-food',
      'single-room',
      'double-room',
      'suite',
      'housekeeping',
      'security',
      'service-elevator',
      'restaurant',
      'retail-shop',
      'cinema',
      'party-hall',
      'express-elevator',
      'medical-center',
      'parking-ramp',
      'parking-space',
      'recycling-center',
      'subway-station',
      'cathedral',
    ];
    for (const unit of units) {
      expect(sprites[`ui/unit-${unit}`], unit).toBeDefined();
    }
  });
});
