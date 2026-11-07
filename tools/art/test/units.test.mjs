import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { unitsGroup } from '../src/groups/units.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([unitsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const catalogWidthTiles = { office: 9, condo: 16 };
const variants = ['empty_day', 'empty_night', 'occupied_day', 'occupied_night'];
const windowCentre = { office: [11, 8], condo: [41, 8] };

describe('units group', () => {
  it('draws empty and occupied, day and night, for offices and condos', () => {
    const expected = Object.keys(catalogWidthTiles).flatMap((subject) =>
      variants.map((variant) => `units/${subject}/${variant}`),
    );
    expect(Object.keys(byId)).toEqual(expected);
  });

  it('sizes every sprite from the catalog width and one floor', () => {
    for (const [subject, widthTiles] of Object.entries(catalogWidthTiles)) {
      for (const variant of variants) {
        const sprite = byId[`units/${subject}/${variant}`];
        expect(sprite.width).toBe(widthTiles * metrics.tileWidth);
        expect(sprite.height).toBe(metrics.floorHeight);
      }
    }
  });

  it('frames the room in ink and keeps the floor slab of a bare tile', () => {
    const slabTop = metrics.floorHeight - metrics.slabHeight;
    for (const subject of Object.keys(catalogWidthTiles)) {
      const day = byId[`units/${subject}/empty_day`];
      const night = byId[`units/${subject}/empty_night`];
      expect(day.get(0, 0)).toBe(colorIndex('ink'));
      expect(day.get(day.width - 1, slabTop - 1)).toBe(colorIndex('ink'));
      expect(day.get(0, slabTop)).toBe(colorIndex('concrete-light'));
      expect(night.get(0, slabTop)).toBe(colorIndex('concrete'));
    }
  });

  it('lights the windows at night only when the unit is occupied', () => {
    for (const [subject, [x, y]] of Object.entries(windowCentre)) {
      expect(byId[`units/${subject}/empty_day`].get(x, y)).toBe(colorIndex('glass'));
      expect(byId[`units/${subject}/empty_night`].get(x, y)).toBe(colorIndex('night-deep'));
      expect(byId[`units/${subject}/occupied_night`].get(x, y)).toBe(colorIndex('lamp-glow'));
    }
  });

  it('hangs a for rent sign on the door only while empty', () => {
    const countLeaf = (canvas) =>
      canvas.pixels.filter((index) => index === colorIndex('leaf')).length;
    const plantLeaf = countLeaf(byId['units/office/occupied_day']);
    expect(countLeaf(byId['units/office/empty_day'])).toBeGreaterThan(plantLeaf);
  });
});
