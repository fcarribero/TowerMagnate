import { describe, expect, it } from 'vitest';
import { toBurnt } from '../src/burnt.mjs';
import { drawGroups } from '../src/build.mjs';
import { PixelCanvas } from '../src/canvas.mjs';
import { transportGroup } from '../src/groups/transport.mjs';
import { unitsGroup } from '../src/groups/units.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([unitsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));

// Catalog size in tiles: width by floors.
const catalog = {
  security: [16, 1],
  'medical-center': [26, 1],
  'recycling-center': [25, 2],
  'parking-ramp': [16, 1],
  'parking-space': [4, 1],
  'subway-station': [30, 3],
};
const variants = ['closed_day', 'closed_night', 'occupied_day', 'occupied_night', 'burnt'];
const disconnected = ['disconnected_day', 'disconnected_night'];
const countColor = (canvas, color) =>
  canvas.pixels.filter((index) => index === colorIndex(color)).length;

describe('service facility sprites', () => {
  it('draws closed and occupied by day and night, plus one burnt sprite', () => {
    for (const subject of Object.keys(catalog)) {
      const ids = Object.keys(byId).filter(
        (id) =>
          id.startsWith(`units/${subject}/`) && !/\/(back-|front-|side_|ceiling_|floor_)/.test(id),
      );
      const expected = subject === 'parking-space' ? [...variants, ...disconnected] : variants;
      expect(ids.sort()).toEqual(expected.map((variant) => `units/${subject}/${variant}`).sort());
    }
  });

  it('draws a disconnected parking space that differs from the closed one', () => {
    const empty = byId['units/parking-space/closed_day'];
    const cut = byId['units/parking-space/disconnected_day'];
    expect(cut.pixels).not.toEqual(empty.pixels);
    expect(countColor(cut, 'cloth-red')).toBeGreaterThan(countColor(empty, 'cloth-red'));
  });

  it('matches the catalog width and floor count', () => {
    for (const [subject, [tiles, floors]] of Object.entries(catalog)) {
      for (const variant of variants) {
        const sprite = byId[`units/${subject}/${variant}`];
        expect(sprite.width, `${subject} ${variant}`).toBe(tiles * metrics.tileWidth);
        expect(sprite.height, `${subject} ${variant}`).toBe(floors * metrics.floorHeight);
      }
    }
  });

  it('frames each unit in ink and keeps the bare slab at the bottom', () => {
    for (const [subject, [, floors]] of Object.entries(catalog)) {
      const day = byId[`units/${subject}/occupied_day`];
      const slabTop = floors * metrics.floorHeight - metrics.slabHeight;
      expect(day.get(0, 0)).toBe(colorIndex('ink'));
      expect(day.get(day.width - 1, slabTop - 1)).toBe(colorIndex('ink'));
      expect(day.get(0, slabTop)).toBe(colorIndex('concrete-light'));
    }
  });

  it('keeps the glass clear and lights it at night only when occupied', () => {
    const windowCentres = {
      security: [9, 8],
      'medical-center': [13, 8],
      'recycling-center': [43, 8],
      'subway-station': [24, 8],
    };
    for (const [subject, [x, y]] of Object.entries(windowCentres)) {
      // Closed units have their curtains drawn; occupied ones have clear glass.
      expect(byId[`units/${subject}/closed_day`].get(x, y)).not.toBe(0);
      expect(byId[`units/${subject}/closed_night`].get(x, y)).not.toBe(0);
      expect(byId[`units/${subject}/occupied_day`].get(x, y)).toBe(0);
      expect(byId[`units/${subject}/occupied_night`].get(x, y)).toBe(0);
    }
  });

  it('shows people, cars and the train only in the occupied sprites', () => {
    const skin = (subject, state) =>
      countColor(byId[`units/${subject}/${state}_day`], 'skin-light');
    expect(skin('security', 'occupied')).toBeGreaterThan(skin('security', 'closed'));
    expect(skin('recycling-center', 'occupied')).toBeGreaterThan(
      skin('recycling-center', 'closed'),
    );
    const glass = (subject, state) => countColor(byId[`units/${subject}/${state}_day`], 'glass');
    expect(glass('parking-space', 'occupied')).toBeGreaterThan(glass('parking-space', 'closed'));
    expect(glass('parking-ramp', 'occupied')).toBeGreaterThan(glass('parking-ramp', 'closed'));
    const train = (state) => countColor(byId[`units/subway-station/${state}_day`], 'lamp-glow');
    expect(train('occupied')).toBeGreaterThan(train('closed'));
  });
});

describe('burnt overlay', () => {
  it('keeps the ink frame and removes every light color from the room', () => {
    for (const subject of Object.keys(catalog)) {
      const burnt = byId[`units/${subject}/burnt`];
      expect(burnt.get(0, 0)).toBe(colorIndex('ink'));
      for (const light of ['white', 'cloud', 'lamp-glow', 'cloth-blue', 'leaf']) {
        expect(countColor(burnt, light), `${subject} ${light}`).toBe(0);
      }
    }
  });

  it('leaves some embers and breaks the windows', () => {
    const burnt = byId['units/security/burnt'];
    expect(countColor(burnt, 'dusk')).toBeGreaterThan(0);
    expect(burnt.get(9, 8)).toBe(0);
  });

  it('works on any sprite and never changes clear pixels', () => {
    const sprite = new PixelCanvas(8, metrics.floorHeight);
    sprite.fillRect(0, 0, 4, metrics.floorHeight, 'wood');
    const burnt = toBurnt(sprite);
    expect(burnt.get(6, 10)).toBe(0);
    expect(burnt.get(2, 10)).not.toBe(colorIndex('wood'));
  });

  it('is deterministic', () => {
    const first = toBurnt(byId['units/security/closed_day']);
    const second = toBurnt(byId['units/security/closed_day']);
    expect(first.pixels).toEqual(second.pixels);
  });
});

describe('service shaft details', () => {
  it('draws a maintenance hatch', () => {
    const [{ sprites: transport }] = drawGroups([transportGroup]);
    const hatch = transport.find((sprite) => sprite.id === 'transport/service-shaft/hatch');
    expect(hatch.canvas.width).toBe(10);
    expect(hatch.canvas.get(0, 0)).toBe(colorIndex('ink'));
    expect(countColor(hatch.canvas, 'lamp')).toBeGreaterThan(0);
  });
});
