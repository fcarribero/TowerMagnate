import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { unitsGroup } from '../src/groups/units.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([unitsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const catalogWidthTiles = {
  'fast-food': 16,
  restaurant: 24,
  'retail-shop': 12,
  'retail-shop-books': 12,
  'retail-shop-grocery': 12,
  'retail-shop-electronics': 12,
};
const variants = ['closed', 'open', 'busy'].flatMap((state) => [`${state}_day`, `${state}_night`]);
const countColor = (canvas, color) =>
  canvas.pixels.filter((index) => index === colorIndex(color)).length;
const sprite = (subject, variant) => byId[`units/${subject}/${variant}`];

describe('food and shop sprites', () => {
  it('draws closed, open and busy, day and night, for every subject', () => {
    for (const subject of Object.keys(catalogWidthTiles)) {
      for (const variant of variants) {
        expect(sprite(subject, variant), `${subject} ${variant}`).toBeDefined();
      }
    }
  });

  it('sizes every sprite from the catalog width and one floor', () => {
    for (const [subject, widthTiles] of Object.entries(catalogWidthTiles)) {
      for (const variant of variants) {
        expect(sprite(subject, variant).width).toBe(widthTiles * metrics.tileWidth);
        expect(sprite(subject, variant).height).toBe(metrics.floorHeight);
      }
    }
  });

  it('has four retail shop looks that differ from each other', () => {
    const shops = Object.keys(catalogWidthTiles).filter((id) => id.startsWith('retail-shop'));
    expect(shops).toHaveLength(4);
    const looks = new Set(shops.map((shop) => sprite(shop, 'open_day').pixels.join()));
    expect(looks.size).toBe(4);
  });

  it('frames each sprite in ink and keeps the floor slab of a bare tile', () => {
    const slabTop = metrics.floorHeight - metrics.slabHeight;
    for (const subject of Object.keys(catalogWidthTiles)) {
      const day = sprite(subject, 'closed_day');
      expect(day.get(0, 0)).toBe(colorIndex('ink'));
      expect(day.get(day.width - 1, slabTop - 1)).toBe(colorIndex('ink'));
      expect(day.get(0, slabTop)).toBe(colorIndex('concrete-light'));
      expect(sprite(subject, 'closed_night').get(0, slabTop)).toBe(colorIndex('concrete'));
    }
  });

  it('covers the front with a shutter only while closed', () => {
    for (const subject of Object.keys(catalogWidthTiles)) {
      const closed = countColor(sprite(subject, 'closed_day'), 'gray');
      const open = countColor(sprite(subject, 'open_day'), 'gray');
      expect(closed).toBeGreaterThan(open + 100);
    }
  });

  it('lights the sign only while open or busy', () => {
    for (const subject of Object.keys(catalogWidthTiles)) {
      const lit = (variant) => countColor(sprite(subject, variant), 'lamp-glow');
      expect(lit('closed_night')).toBe(0);
      expect(lit('open_night')).toBeGreaterThan(0);
      expect(lit('busy_night')).toBeGreaterThan(0);
    }
  });

  it('adds customers only when busy', () => {
    for (const subject of Object.keys(catalogWidthTiles)) {
      const skin = (variant) =>
        ['skin-light', 'skin-mid', 'skin-dark'].reduce(
          (sum, color) => sum + countColor(sprite(subject, variant), color),
          0,
        );
      expect(skin('busy_day')).toBeGreaterThan(skin('open_day'));
    }
  });
});
