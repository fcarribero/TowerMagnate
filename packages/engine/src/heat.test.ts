import { describe, expect, it } from 'vitest';
import { HEAT_NOISE_CELLS, LAST_COLUMN } from '@tower-magnate/shared';
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

  it('has a unit in use speak every minute, with a fade, and fades the maps every 5 minutes', () => {
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
      people: { id: [], level: [], column: [], trip: [], kind: [] },
    } as unknown as TowerState;
    heatSystem({ state });
    const row = state.heat?.noise['2'] as number[];
    expect(row[40]).toBeCloseTo(0.1);
    expect(row[60]).toBeGreaterThan(0);
    expect(row[200]).toBe(0);
    // four minutes later the map fades: minute 545 is a multiple of 5
    state.step += 4 * 6;
    heatSystem({ state });
    expect((state.heat?.noise['2'] as number[])[40]).toBeCloseTo(0.2 * 0.5);
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
});
