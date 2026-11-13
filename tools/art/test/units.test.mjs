import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { unitsGroup } from '../src/groups/units.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([unitsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const DEPTH_LAYER = /\/(back-|front-|side_|ceiling_|floor_)/;
const rentableIds = Object.keys(byId).filter(
  (id) => /^units\/(office|condo|.*room|suite|housekeeping)\//.test(id) && !DEPTH_LAYER.test(id),
);
const cathedralVariants = ['empty_day', 'empty_night', 'wedding_day', 'wedding_night'];
const catalogWidthTiles = {
  office: 9,
  condo: 16,
  'single-room': 4,
  'double-room': 6,
  suite: 10,
  housekeeping: 15,
};
const hotelRooms = ['single-room', 'double-room', 'suite'];
const states = (subject) =>
  hotelRooms.includes(subject) ? ['empty', 'occupied', 'dirty', 'infested'] : ['empty', 'occupied'];
const variantsOf = (subject) =>
  states(subject).flatMap((state) => [`${state}_day`, `${state}_night`]);
const windowCentre = {
  office: [11, 8],
  condo: [41, 8],
  'single-room': [17, 7],
  'double-room': [21, 7],
  suite: [19, 7],
  housekeeping: [52, 7],
};
const countColor = (canvas, color) =>
  canvas.pixels.filter((index) => index === colorIndex(color)).length;

describe('units group', () => {
  it('draws every state at day and night, hotel rooms also dirty and infested', () => {
    const expected = Object.keys(catalogWidthTiles).flatMap((subject) =>
      variantsOf(subject).map((variant) => `units/${subject}/${variant}`),
    );
    expect(rentableIds).toEqual(expected);
  });

  it('sizes every sprite from the catalog width and one floor', () => {
    for (const [subject, widthTiles] of Object.entries(catalogWidthTiles)) {
      for (const variant of variantsOf(subject)) {
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

  it('keeps window glass clear and lights it at night only when the unit is occupied', () => {
    for (const [subject, [x, y]] of Object.entries(windowCentre)) {
      expect(byId[`units/${subject}/empty_day`].get(x, y)).toBe(0);
      expect(byId[`units/${subject}/empty_night`].get(x, y)).toBe(0);
      expect(byId[`units/${subject}/occupied_night`].get(x, y)).toBe(colorIndex('lamp-glow'));
    }
  });

  it('leaves grime on the floor of dirty and infested hotel rooms', () => {
    for (const room of hotelRooms) {
      const clean = countColor(byId[`units/${room}/empty_day`], 'leaf-dark');
      expect(countColor(byId[`units/${room}/dirty_day`], 'leaf-dark')).toBeGreaterThan(clean);
      expect(byId[`units/${room}/dirty_day`].pixels).not.toEqual(
        byId[`units/${room}/empty_day`].pixels,
      );
    }
  });

  it('adds 4 to 8 roaches to the dirty room when infested', () => {
    for (const room of hotelRooms) {
      const roachPixels =
        countColor(byId[`units/${room}/infested_day`], 'wood-dark') -
        countColor(byId[`units/${room}/dirty_day`], 'wood-dark');
      expect(roachPixels).toBeGreaterThanOrEqual(8);
      expect(roachPixels).toBeLessThanOrEqual(16);
    }
  });

  it('shows the maids in housekeeping only while occupied', () => {
    const apronBlue = (variant) => countColor(byId[`units/housekeeping/${variant}`], 'cloth-blue');
    expect(apronBlue('occupied_day')).toBeGreaterThan(apronBlue('empty_day'));
    expect(countColor(byId['units/housekeeping/empty_day'], 'skin-mid')).toBe(0);
  });
});

describe('cathedral', () => {
  const lancetPane = [66, 80];

  it('draws empty and wedding, day and night, 28 tiles by 4 floors', () => {
    for (const variant of cathedralVariants) {
      const sprite = byId[`units/cathedral/${variant}`];
      expect(sprite, variant).toBeDefined();
      expect(sprite.width).toBe(28 * metrics.tileWidth);
      expect(sprite.height).toBe(4 * metrics.floorHeight);
    }
  });

  it('keeps the floor slab of a bare tile under the whole nave', () => {
    const day = byId['units/cathedral/empty_day'];
    const slabTop = day.height - metrics.slabHeight;
    expect(day.get(day.width - 1, slabTop)).toBe(colorIndex('concrete-light'));
    expect(byId['units/cathedral/empty_night'].get(day.width - 1, slabTop)).toBe(
      colorIndex('concrete'),
    );
  });

  it('lays a red carpet and flowers only for the wedding', () => {
    const empty = byId['units/cathedral/empty_day'];
    const wedding = byId['units/cathedral/wedding_day'];
    expect(countColor(wedding, 'cloth-red')).toBeGreaterThan(countColor(empty, 'cloth-red') + 200);
    expect(countColor(wedding, 'leaf')).toBeGreaterThan(countColor(empty, 'leaf'));
  });

  it('lights the stained glass at night only during a wedding', () => {
    const [x, y] = lancetPane;
    expect(byId['units/cathedral/empty_day'].get(x, y)).not.toBe(colorIndex('night-deep'));
    expect(byId['units/cathedral/empty_night'].get(x, y)).toBe(colorIndex('night-deep'));
    expect(byId['units/cathedral/wedding_night'].get(x, y)).not.toBe(colorIndex('night-deep'));
  });
});

describe('entertainment units', () => {
  const variants = {
    cinema: ['empty_day', 'empty_night', 'show_day', 'show_night'],
    'party-hall': ['empty_day', 'empty_night', 'party_day', 'party_night'],
  };
  const widthTiles = { cinema: 31, 'party-hall': 24 };

  it('draws every variant two floors tall at the catalog width', () => {
    for (const [subject, names] of Object.entries(variants)) {
      for (const name of names) {
        const sprite = byId[`units/${subject}/${name}`];
        expect(sprite, `${subject}/${name}`).toBeDefined();
        expect(sprite.width).toBe(widthTiles[subject] * metrics.tileWidth);
        expect(sprite.height).toBe(2 * metrics.floorHeight);
      }
    }
  });

  it('keeps a bare-tile slab along the bottom of both units', () => {
    for (const subject of Object.keys(variants)) {
      const day = byId[`units/${subject}/empty_day`];
      const slabTop = day.height - metrics.slabHeight;
      expect(day.get(day.width - 2, slabTop)).toBe(colorIndex('concrete-light'));
    }
  });

  it('shows the film, the beam and an audience only during a show', () => {
    const empty = byId['units/cinema/empty_day'];
    const show = byId['units/cinema/show_day'];
    expect(countColor(show, 'lamp-glow')).toBeGreaterThan(countColor(empty, 'lamp-glow') + 20);
    expect(countColor(show, 'skin-mid')).toBeGreaterThan(countColor(empty, 'skin-mid'));
    expect(countColor(byId['units/cinema/show_night'], 'sky')).toBe(countColor(show, 'sky'));
  });

  it('adds guests and confetti only during a party, and lights the windows at night', () => {
    const empty = byId['units/party-hall/empty_day'];
    const party = byId['units/party-hall/party_day'];
    expect(countColor(party, 'skin-mid')).toBeGreaterThan(countColor(empty, 'skin-mid'));
    expect(countColor(party, 'lamp')).toBeGreaterThan(countColor(empty, 'lamp'));
    const [x, y] = [16, 12];
    expect(byId['units/party-hall/empty_night'].get(x, y)).toBe(0);
    expect(byId['units/party-hall/party_night'].get(x, y)).toBe(colorIndex('lamp-glow'));
  });

  it('has no middle slab inside the tall room', () => {
    for (const subject of Object.keys(variants)) {
      const day = byId[`units/${subject}/empty_day`];
      const middleSlabRow = metrics.floorHeight - 1;
      expect(day.get(day.width - 3, middleSlabRow)).not.toBe(colorIndex('concrete-dark'));
    }
  });
});
