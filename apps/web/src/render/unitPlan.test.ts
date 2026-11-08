import { UNIT_CATALOG, UNIT_TYPES } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { isPlacedUnit, planTransport, planUnit } from './unitPlan';

const base = { id: 'u1', x: 10, level: 5, occupied: false, variant: 'empty' } as const;

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

  it('draws stage 2 variants as empty or occupied', () => {
    const dirty = planUnit({ ...base, type: 'single-room', variant: 'dirty' }, 'day');
    expect(dirty?.variant.state).toBe('empty');
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
