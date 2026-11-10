import type { Command, Level, ShaftType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { clearStructure, occupantAt } from '../grid';
import { buildTower, plainTowerPlan } from '../testing';
import { accept, fullSiteTower, rejection } from './shaft-test-helpers';

function shaft(shaftType: ShaftType, x: number, bottom: Level, top: Level): Command {
  return { type: 'buildShaft', shaftType, x, bottom, top };
}

function resize(shaftId: string, bottom: Level, top: Level): Command {
  return { type: 'resizeShaft', shaftId, bottom, top };
}

describe('buildShaft', () => {
  it('places a standard shaft with one idle car and charges shaft plus car', () => {
    const { state, spent } = accept(fullSiteTower(), shaft('standard', 40, -9, 21));
    expect(spent).toBe(280_000);
    const placed = Object.values(state.shafts);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      type: 'standard',
      x: 40,
      bottom: -9,
      top: 21,
      paid: 200_000,
    });
    expect(placed[0]?.cars).toEqual([
      {
        homeLevel: -9,
        level: -9,
        riders: [],
        phase: 'idle',
        direction: 'idle',
        phaseStepsLeft: 0,
        assigned: [],
        trips: [],
        paid: 80_000,
        placedAtStep: 0,
      },
    ]);
    const occupant = { kind: 'shaft', id: placed[0]?.id };
    expect(occupantAt(state.grid, -9, 40)).toEqual(occupant);
    expect(occupantAt(state.grid, 21, 43)).toEqual(occupant);
    expect(occupantAt(state.grid, 21, 44)).toBeNull();
    expect(occupantAt(state.grid, 22, 40)).toBeNull();
  });

  it('charges each type its own price', () => {
    expect(accept(fullSiteTower(), shaft('service', 40, 1, 10)).spent).toBe(150_000);
    expect(accept(fullSiteTower(), shaft('express', 40, 1, 90)).spent).toBe(850_000);
  });

  it('limits standard and service shafts to 30 levels, counted without level 0', () => {
    expect(rejection(fullSiteTower(), shaft('standard', 40, -9, 22))).toBe('SHAFT_TOO_TALL');
    expect(rejection(fullSiteTower(), shaft('service', 40, 2, 32))).toBe('SHAFT_TOO_TALL');
    accept(fullSiteTower(), shaft('service', 40, 72, 101));
  });

  it('lets express shafts end only at express stops', () => {
    accept(fullSiteTower(), shaft('express', 40, 1, 30));
    accept(fullSiteTower(), shaft('express', 40, -9, 90));
    expect(rejection(fullSiteTower(), shaft('express', 40, 1, 31))).toBe(
      'EXPRESS_STOP_NOT_ALLOWED',
    );
    expect(rejection(fullSiteTower(), shaft('express', 40, 1, 16))).toBe(
      'EXPRESS_STOP_NOT_ALLOWED',
    );
    expect(rejection(fullSiteTower(), shaft('express', 40, 2, 15))).toBe(
      'EXPRESS_STOP_NOT_ALLOWED',
    );
    expect(rejection(fullSiteTower(), shaft('express', 40, 90, 101))).toBe(
      'EXPRESS_STOP_NOT_ALLOWED',
    );
  });

  it('keeps 8 free columns to any shaft that shares a level', () => {
    const tower = fullSiteTower([
      { type: 'standard', x: 40, bottom: 1, top: 10 },
      { type: 'express', x: 100, bottom: 1, top: 15 },
    ]);
    expect(rejection(tower, shaft('standard', 51, 10, 20))).toBe('SHAFT_TOO_CLOSE');
    accept(tower, shaft('standard', 52, 10, 20));
    expect(rejection(tower, shaft('standard', 89, 5, 6))).toBe('SHAFT_TOO_CLOSE');
    accept(tower, shaft('standard', 88, 5, 6));
    expect(rejection(tower, shaft('express', 113, 1, 1))).toBe('SHAFT_TOO_CLOSE');
    accept(tower, shaft('express', 114, 1, 1));
  });

  it('allows close shafts whose ranges share no level', () => {
    const tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    accept(tower, shaft('standard', 44, 11, 20));
  });

  it('allows at most 24 shafts per tower', () => {
    const shafts = Array.from({ length: 24 }, (_, index) => ({
      type: 'standard' as const,
      x: index * 12,
      bottom: 1,
      top: 2,
    }));
    const tower = fullSiteTower(shafts.slice(0, 23));
    const { state } = accept(tower, shaft('standard', 23 * 12, 1, 2));
    expect(rejection(state, shaft('standard', 24 * 12, 1, 2))).toBe('LIMIT_REACHED');
  });

  it('needs empty floor or lobby on every cell of the range', () => {
    const { state: shortTower } = buildTower(plainTowerPlan(5, 0, 100));
    shortTower.money = 1_000_000;
    expect(rejection(shortTower, shaft('standard', 10, 1, 6))).toBe('NO_FLOOR');
    accept(shortTower, shaft('standard', 10, 1, 5));

    const holed = fullSiteTower();
    clearStructure(holed.grid, 7, 43, 43);
    expect(rejection(holed, shaft('standard', 40, 1, 10))).toBe('NO_FLOOR');

    const busy = fullSiteTower([{ type: 'standard', x: 60, bottom: 1, top: 3 }]);
    accept(busy, shaft('standard', 58, 4, 10));
    expect(rejection(busy, shaft('standard', 58, 3, 10))).toBe('CELL_OCCUPIED');
  });

  it('rejects ranges off the grid', () => {
    const tower = fullSiteTower();
    expect(rejection(tower, shaft('standard', 40, -10, 5))).toBe('LEVEL_RESERVED');
    expect(rejection(tower, shaft('standard', 40, 90, 102))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, shaft('standard', 40, 0, 5))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, shaft('standard', 372, 1, 5))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, shaft('standard', 40, 5, 1))).toBe('INVALID_COMMAND');
    expect(rejection(tower, { ...shaft('standard', 40, 1, 5), shaftType: 'glass' } as never)).toBe(
      'INVALID_COMMAND',
    );
  });

  it('checks money last and refuses any construction while in debt', () => {
    const poor = fullSiteTower();
    poor.money = 279_999;
    expect(rejection(poor, shaft('standard', 40, 1, 5))).toBe('INSUFFICIENT_FUNDS');
    expect(rejection(poor, shaft('standard', 40, 1, 50))).toBe('SHAFT_TOO_TALL');
    poor.money = -1;
    expect(rejection(poor, shaft('standard', 40, 1, 5))).toBe('NEGATIVE_BALANCE');
  });
});

describe('resizeShaft', () => {
  it('extends a shaft for free', () => {
    const tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    const { state, spent } = accept(tower, resize('s1', -3, 20));
    expect(spent).toBe(0);
    expect(state.shafts.s1).toMatchObject({ bottom: -3, top: 20 });
    expect(occupantAt(state.grid, -3, 40)).toEqual({ kind: 'shaft', id: 's1' });
    expect(occupantAt(state.grid, 20, 43)).toEqual({ kind: 'shaft', id: 's1' });
  });

  it('trims a shaft and brings idle cars back inside it', () => {
    const tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    const car = tower.shafts.s1?.cars[0];
    if (!car) throw new Error('Expected a car');
    car.level = 9;
    const { state } = accept(tower, resize('s1', 3, 6));
    expect(state.shafts.s1?.cars[0]).toMatchObject({ homeLevel: 3, level: 6 });
    expect(occupantAt(state.grid, 2, 40)).toBeNull();
    expect(occupantAt(state.grid, 7, 40)).toBeNull();
    expect(occupantAt(state.grid, 5, 40)).toEqual({ kind: 'shaft', id: 's1' });
  });

  it('refuses to trim past a car with riders', () => {
    const tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    const car = tower.shafts.s1?.cars[0];
    if (!car) throw new Error('Expected a car');
    car.level = 9;
    car.riders = ['p50'];
    expect(rejection(tower, resize('s1', 1, 8))).toBe('SHAFT_IN_USE');
    accept(tower, resize('s1', 1, 9));
  });

  it('re-runs the placement checks on the new range', () => {
    const tower = fullSiteTower([
      { type: 'standard', x: 40, bottom: 1, top: 10 },
      { type: 'standard', x: 50, bottom: 20, top: 25 },
      { type: 'express', x: 100, bottom: 1, top: 15 },
    ]);
    expect(rejection(tower, resize('s1', 1, 31))).toBe('SHAFT_TOO_TALL');
    expect(rejection(tower, resize('s1', 1, 20))).toBe('SHAFT_TOO_CLOSE');
    expect(rejection(tower, resize('s3', 1, 16))).toBe('EXPRESS_STOP_NOT_ALLOWED');
    accept(tower, resize('s3', 1, 30));
    clearStructure(tower.grid, 12, 40, 43);
    expect(rejection(tower, resize('s1', 1, 12))).toBe('NO_FLOOR');
    expect(rejection(tower, resize('s9', 1, 5))).toBe('UNKNOWN_ENTITY');
  });

  it('is construction, so debt blocks it', () => {
    const tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    tower.money = -5;
    expect(rejection(tower, resize('s1', 1, 12))).toBe('NEGATIVE_BALANCE');
  });
});
