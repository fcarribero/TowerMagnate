import { LAST_COLUMN, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, slotOfPerson } from './people';
import { buildTower, plainTowerPlan } from './testing';
import { addStay, stressCausesOf } from './trip-ledger';

function row(value: number): number[] {
  return new Array<number>(LAST_COLUMN + 1).fill(value);
}

/** A tower with level 2 covered in the given noise and dirt, an hour after a trip ended. */
function tower(noise: number, dirt: number, units: Parameters<typeof buildTower>[0]['units'] = []) {
  const { state, unitIds } = buildTower({ ...plainTowerPlan(3, 0, 120), units });
  state.heat = { noise: { '2': row(noise) }, dirt: { '2': row(dirt) }, cars: {} };
  state.step = 360;
  return { state, unitIds };
}

function stayOf(
  state: TowerState,
  kind: 'officeWorker' | 'resident' | 'hotelGuest',
  homeUnit = 0,
  column = 50,
) {
  const id = addPerson(state, { kind, homeUnit, level: 2, column });
  state.tripLedger[id] = [0, 0];
  const slot = slotOfPerson(state.people, id);
  addStay(state, slot);
  return stressCausesOf(state.people, slot);
}

describe('noise and dirt felt where a person stays', () => {
  it('keeps noise and dirt as two causes', () => {
    expect(stayOf(tower(20, 0).state, 'resident')).toMatchObject({ dirt: 0 });
    expect(stayOf(tower(20, 0).state, 'resident').noise).toBeGreaterThan(0);
    expect(stayOf(tower(0, 3).state, 'resident')).toMatchObject({ noise: 0 });
    expect(stayOf(tower(0, 3).state, 'resident').dirt).toBeGreaterThan(0);
    const both = stayOf(tower(20, 3).state, 'resident');
    expect(both.noise).toBeGreaterThan(0);
    expect(both.dirt).toBeGreaterThan(0);
  });

  it('lets a resident feel the noise of the cell, but not an office worker', () => {
    expect(stayOf(tower(20, 0).state, 'officeWorker').noise).toBe(0);
  });

  it('spares a hotel guest the dirt of their own room, but not of the hall', () => {
    const { state, unitIds } = tower(0, 3, [{ type: 'single-room', level: 2, x: 40 }]);
    const room = Number((unitIds[0] as string).slice(1));
    expect(stayOf(state, 'hotelGuest', room, 41).dirt).toBe(0);
    expect(stayOf(state, 'hotelGuest', room, 100).dirt).toBeGreaterThan(0);
  });
});
