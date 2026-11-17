import { describe, expect, it } from 'vitest';
import { HEAT_NOISE_CELLS, LAST_COLUMN, PERSON_KINDS } from '@tower-magnate/shared';
import { encodeBuilderTask } from './construction';
import {
  addCarRider,
  addToCell,
  addWithFade,
  carLevels,
  dither,
  emptyHeat,
  heatSystem,
  stepsFelt,
  valueAt,
} from './heat';
import type { TowerState } from '@tower-magnate/shared';

describe('heat maps', () => {
  it('fades a unit noise in a straight line from its last cell over 15 cells', () => {
    const heat = emptyHeat();
    addWithFade(heat.noise, 2, 40, 49, 1, HEAT_NOISE_CELLS);
    expect(valueAt(heat.noise, 2, 40)).toBe(1);
    expect(valueAt(heat.noise, 2, 49)).toBe(1);
    expect(valueAt(heat.noise, 2, 50)).toBeCloseTo(15 / 16);
    expect(valueAt(heat.noise, 2, 64)).toBeCloseTo(1 / 16);
    expect(valueAt(heat.noise, 2, 65)).toBe(0);
    expect(valueAt(heat.noise, 2, 39)).toBeCloseTo(15 / 16);
    expect(valueAt(heat.noise, 3, 45)).toBe(0);
  });

  it('keeps inside the site at the edges', () => {
    const heat = emptyHeat();
    addWithFade(heat.noise, 1, 0, 2, 1, HEAT_NOISE_CELLS);
    addWithFade(heat.noise, 1, LAST_COLUMN - 2, LAST_COLUMN, 1, HEAT_NOISE_CELLS);
    expect(heat.noise[1]).toHaveLength(LAST_COLUMN + 1);
  });

  it('adds up the small amounts many people leave in one cell', () => {
    const heat = emptyHeat();
    for (let person = 0; person < 60; person++) addToCell(heat.noise, 1, 10, 0.02);
    expect(valueAt(heat.noise, 1, 10)).toBeCloseTo(1.2);
  });

  it('turns small stress per minute into whole steps that average out', () => {
    let total = 0;
    for (let minute = 0; minute < 2000; minute++) total += stepsFelt(0.4, 1, 7, minute);
    expect(total / 2000).toBeGreaterThan(0.3);
    expect(total / 2000).toBeLessThan(0.5);
  });

  it('gives a little back in a calm cell', () => {
    let total = 0;
    for (let minute = 0; minute < 1000; minute++) total += stepsFelt(0, 1, 9, minute);
    expect(total / 1000).toBeLessThan(-0.1);
    expect(total / 1000).toBeGreaterThan(-0.3);
  });

  it('draws the same number for the same person and minute', () => {
    expect(dither(5, 100)).toBe(dither(5, 100));
    expect(dither(5, 100)).not.toBe(dither(6, 100));
  });

  it('has a unit in use speak every minute, with a fade, and fades the maps every minute', () => {
    const office = {
      id: 'u1',
      type: 'office',
      level: 2,
      x: 40,
      lease: {},
      sale: null,
      hotel: null,
      venue: null,
    };
    const state = {
      step: 9 * 360 + 6,
      units: { u1: office },
      grid: {
        levels: {
          '2': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '3': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '4': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '5': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '6': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
        },
      },
      sites: {},
      people: { id: [], level: [], column: [], trip: [], kind: [] },
    } as unknown as TowerState;
    heatSystem({ state });
    const row = state.heat?.noise['2'] as number[];
    expect(row[40]).toBeCloseTo(0.5 * 0.87055);
    expect(row[60]).toBeGreaterThan(0);
    // no floor past column 120, so nothing is stored there
    expect(row[121]).toBe(0);
    expect(row[200]).toBe(0);
    // it fades a little each minute: after 5 minutes of nothing new, half is left
    const before = row[40] as number;
    state.units = {};
    for (let minute = 0; minute < 5; minute++) {
      state.step += 6;
      heatSystem({ state });
    }
    expect((state.heat?.noise['2'] as number[])[40]).toBeCloseTo(before * 0.5, 3);
  });

  it('keeps noise and dirt per elevator car, and more dirt for a bag', () => {
    const state = { step: 0 } as TowerState;
    addCarRider(state, 's1', 1, false);
    addCarRider(state, 's1', 1, true);
    const car = carLevels(state, 's1', 1);
    expect(car.noise).toBeCloseTo(0.6);
    expect(car.dirt).toBeCloseTo(0.2 + 1);
    expect(carLevels(state, 's1', 0)).toEqual({ noise: 0, dirt: 0 });
  });

  it('has a construction site speak on its own levels and on the levels above and below', () => {
    const state = {
      step: 6,
      units: {},
      grid: {
        levels: {
          '2': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '3': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '4': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '5': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
          '6': { structure: [{ kind: 'floor', x0: 0, x1: 120 }], occupants: [] },
        },
      },
      sites: {
        u9: { id: 'u9', type: 'office', level: 5, x: 40 },
        u10: { id: 'u10', type: 'office', level: 2, x: 40 },
      },
      people: {
        id: [1],
        level: [5],
        column: [42],
        trip: [encodeBuilderTask({ phase: 'working', site: 9 })],
        kind: [PERSON_KINDS.indexOf('builder')],
      },
    } as unknown as TowerState;
    heatSystem({ state });
    const noise = state.heat?.noise ?? {};
    const fade = 0.5 ** (1 / 5);
    // u10 has no builder working on it, so it makes no noise
    expect(valueAt(noise, 2, 42)).toBe(0);
    expect(valueAt(noise, 5, 42)).toBeCloseTo(8 * fade);
    expect(valueAt(noise, 4, 42)).toBeCloseTo(5 * fade);
    expect(valueAt(noise, 6, 42)).toBeCloseTo(5 * fade);
    expect(valueAt(noise, 7, 42)).toBe(0);
    expect(valueAt(noise, 3, 42)).toBe(0);
  });

  it('keeps dirt as it is and holds no heat where there is no floor', () => {
    const state = {
      step: 6,
      units: { u1: { id: 'u1', type: 'fast-food', level: 2, x: 40, venue: { garbage: 1 } } },
      grid: { levels: { '2': { structure: [{ kind: 'floor', x0: 30, x1: 60 }], occupants: [] } } },
      sites: {},
      people: { id: [], level: [], column: [], trip: [], kind: [] },
    } as unknown as TowerState;
    heatSystem({ state });
    const dirt = state.heat?.dirt['2'] as number[];
    const first = dirt[52] as number;
    expect(first).toBeGreaterThan(0);
    expect(dirt[10]).toBe(0);
    expect(dirt[70]).toBe(0);
    state.units = {};
    for (let minute = 0; minute < 10; minute++) {
      state.step += 6;
      heatSystem({ state });
    }
    expect((state.heat?.dirt['2'] as number[])[52]).toBe(first);
  });
});
