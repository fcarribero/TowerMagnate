import { UNIT_CATALOG, UNIT_TYPES } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { SPRITE_IDS } from './atlasManifest';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { spriteVariantId } from './spriteRegistry';
import { isPlacedUnit, planTransport, planUnit, spriteState } from './unitPlan';
import { stepAtHour } from './timeOfDay';
import { ALL_VENUES_OPEN, openVenuesAt } from './venueHours';

const base = {
  id: 'u1',
  x: 10,
  level: 5,
  occupied: false,
  variant: 'empty',
  price: 'normal',
} as const;

describe('planUnit', () => {
  it('draws 18 unit types', () => {
    expect(UNIT_TYPES.filter(isPlacedUnit)).toHaveLength(18);
  });

  it('picks the empty or occupied sprite and the time of day', () => {
    const empty = planUnit({ ...base, type: 'office' }, 'day');
    const occupied = planUnit(
      { ...base, type: 'office', occupied: true, variant: 'occupied' },
      'night',
    );
    expect(empty?.variant).toEqual({ state: 'empty', time: 'day' });
    expect(occupied?.variant).toEqual({ state: 'occupied', time: 'night' });
  });

  it('draws dirty and infested hotel rooms and a disconnected parking space', () => {
    const dirty = planUnit({ ...base, type: 'single-room', variant: 'dirty' }, 'day');
    const infested = planUnit({ ...base, type: 'suite', variant: 'infested' }, 'night');
    const cut = planUnit({ ...base, type: 'parking-space', variant: 'disconnected' }, 'day');
    expect(dirty?.variant).toEqual({ state: 'dirty', time: 'day' });
    expect(infested?.variant).toEqual({ state: 'infested', time: 'night' });
    expect(cut?.variant).toEqual({ state: 'disconnected', time: 'day' });
  });

  it('falls back to empty for a variant the unit has no sprite for', () => {
    const office = planUnit({ ...base, type: 'office', variant: 'dirty' }, 'day');
    expect(office?.variant.state).toBe('empty');
  });

  it('draws shops and food venues open or busy', () => {
    const fastFood = planUnit({ ...base, type: 'fast-food' }, 'day');
    const restaurant = planUnit(
      { ...base, type: 'restaurant', occupied: true, variant: 'occupied' },
      'night',
    );
    expect(fastFood?.variant).toEqual({ state: 'open', time: 'day' });
    expect(restaurant?.variant).toEqual({ state: 'busy', time: 'night' });
  });

  it('draws venues closed outside their opening hours', () => {
    const midnight = openVenuesAt(0);
    const evening = openVenuesAt(stepAtHour(21));
    for (const type of ['fast-food', 'restaurant', 'retail-shop'] as const) {
      const busy = { ...base, type, occupied: true, variant: 'occupied' } as const;
      expect(planUnit(busy, 'night', null, midnight)?.variant).toEqual({
        state: 'closed',
        time: 'night',
      });
    }
    const restaurant = planUnit({ ...base, type: 'restaurant' }, 'night', null, evening);
    const fastFood = planUnit({ ...base, type: 'fast-food' }, 'night', null, evening);
    expect(restaurant?.variant.state).toBe('open');
    expect(fastFood?.variant.state).toBe('closed');
  });

  it('keeps other units on their usual sprite at night', () => {
    const office = planUnit({ ...base, type: 'office' }, 'night', null, openVenuesAt(0));
    expect(office?.variant.state).toBe('empty');
  });

  it('draws a show, a party and a wedding for an occupied cinema, party hall and cathedral', () => {
    expect(spriteState('cinema', true)).toBe('show');
    expect(spriteState('party-hall', true)).toBe('party');
    expect(spriteState('cathedral', true)).toBe('wedding');
    expect(spriteState('cinema', false)).toBe('empty');
  });

  it('has an atlas sprite for every unit drawn empty or occupied, open or closed, by day and by night', () => {
    const atlas = new Set<string>(SPRITE_IDS);
    const missing: string[] = [];
    for (const type of UNIT_TYPES.filter(isPlacedUnit)) {
      for (const occupied of [false, true]) {
        for (const time of ['day', 'night'] as const) {
          for (const openVenues of [ALL_VENUES_OPEN, openVenuesAt(0)]) {
            const drawing = planUnit(
              { ...base, type, occupied, variant: occupied ? 'occupied' : 'empty' },
              time,
              null,
              openVenues,
            );
            const id = drawing && spriteVariantId(drawing.subject, drawing.variant);
            if (id !== null && !atlas.has(id)) {
              missing.push(id);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the footprint, growing up from the bottom level', () => {
    const cinema = planUnit({ ...base, type: 'cinema' }, 'day');
    const height = UNIT_CATALOG.cinema.height;
    const floors = height.kind === 'fixed' ? height.floors : 0;
    expect(floors).toBeGreaterThan(1);
    expect(cinema).toMatchObject({
      x: 10 * TILE_WIDTH,
      y: -(floors - 1) * FLOOR_HEIGHT,
      width: UNIT_CATALOG.cinema.width * TILE_WIDTH,
      height: floors * FLOOR_HEIGHT,
    });
  });

  it('skips structure and elevators', () => {
    expect(planUnit({ ...base, type: 'floor' }, 'day')).toBeNull();
    expect(planUnit({ ...base, type: 'standard-elevator' }, 'day')).toBeNull();
  });

  it('keeps a footprint that crosses level 0 contiguous', () => {
    const below = planUnit({ ...base, type: 'cinema', level: -1 }, 'day');
    expect(below?.height).toBe(2 * FLOOR_HEIGHT);
    expect(below?.y).toBe(-FLOOR_HEIGHT);
  });
});

describe('planTransport', () => {
  it('uses the first escalator frame and a plain stairs sprite', () => {
    const escalator = planTransport({ id: 't1', type: 'escalator', x: 3, level: 1 }, 'night');
    const stairs = planTransport({ id: 't2', type: 'stairs', x: 3, level: 1 }, 'day');
    expect(escalator.variant).toEqual({ time: 'night', frame: 1 });
    expect(stairs.variant).toEqual({ time: 'day' });
    expect(stairs.subject).toBe('transport/stairs');
  });
});
