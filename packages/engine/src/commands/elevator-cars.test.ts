import type { Command, Level } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { accept, fullSiteTower, rejection } from './shaft-test-helpers';

function addCar(shaftId: string, homeLevel: Level): Command {
  return { type: 'addCar', shaftId, homeLevel };
}

function removeCar(shaftId: string, carIndex: number): Command {
  return { type: 'removeCar', shaftId, carIndex };
}

function towerWithShafts() {
  return fullSiteTower([
    { type: 'standard', x: 40, bottom: 1, top: 10 },
    { type: 'express', x: 100, bottom: 1, top: 30 },
  ]);
}

describe('addCar', () => {
  it('adds idle cars at their home level up to 8, charging the car price', () => {
    let tower = towerWithShafts();
    for (let count = 2; count <= 8; count++) {
      const { state, spent } = accept(tower, addCar('s1', count));
      expect(spent).toBe(80_000);
      tower = state;
    }
    expect(tower.shafts.s1?.cars).toHaveLength(8);
    expect(tower.shafts.s1?.cars[7]).toEqual({
      homeLevel: 8,
      level: 8,
      riders: [],
      paid: 80_000,
      placedAtStep: 0,
    });
    expect(rejection(tower, addCar('s1', 5))).toBe('CAR_LIMIT');
  });

  it('needs a home level inside the shaft', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, addCar('s1', 11))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, addCar('s1', -1))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, addCar('s1', 0))).toBe('OUT_OF_BOUNDS');
  });

  it('parks express cars only at express stops', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, addCar('s2', 16))).toBe('EXPRESS_STOP_NOT_ALLOWED');
    expect(accept(tower, addCar('s2', 15)).spent).toBe(150_000);
  });

  it('rejects unknown shafts, short funds and debt', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, addCar('s9', 1))).toBe('UNKNOWN_ENTITY');
    tower.money = 79_999;
    expect(rejection(tower, addCar('s1', 1))).toBe('INSUFFICIENT_FUNDS');
    tower.money = -1;
    expect(rejection(tower, addCar('s1', 1))).toBe('NEGATIVE_BALANCE');
  });
});

describe('removeCar', () => {
  it('removes a car by index', () => {
    const { state: withTwo } = accept(towerWithShafts(), addCar('s1', 6));
    const { state, spent } = accept(withTwo, removeCar('s1', 0));
    expect(spent).toBe(0);
    expect(state.shafts.s1?.cars.map((car) => car.homeLevel)).toEqual([6]);
  });

  it('keeps the last car', () => {
    expect(rejection(towerWithShafts(), removeCar('s1', 0))).toBe('LAST_CAR');
  });

  it('refuses to remove a car with riders, before the last-car check', () => {
    const tower = towerWithShafts();
    const car = tower.shafts.s1?.cars[0];
    if (!car) throw new Error('Expected a car');
    car.riders = ['p50'];
    expect(rejection(tower, removeCar('s1', 0))).toBe('SHAFT_IN_USE');
  });

  it('finds nothing to remove for a missing shaft or car', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, removeCar('s9', 0))).toBe('NOTHING_TO_DEMOLISH');
    expect(rejection(tower, removeCar('s1', 3))).toBe('NOTHING_TO_DEMOLISH');
  });

  it('works while in debt, like any demolition', () => {
    const { state } = accept(towerWithShafts(), addCar('s1', 6));
    state.money = -100;
    expect(accept(state, removeCar('s1', 1)).spent).toBe(0);
  });
});
