import { LAST_COLUMN, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, slotOfPerson } from './people';
import { buildTower, plainTowerPlan } from './testing';
import { addStay, stressCausesOf } from './trip-ledger';

/** A tower with heavy noise on every cell of level 2 and no dirt, an hour after a trip ended. */
function noisyTower(): TowerState {
  const { state } = buildTower(plainTowerPlan(3, 0, 120));
  state.heat = { noise: { '2': new Array<number>(LAST_COLUMN + 1).fill(20) }, dirt: {}, cars: {} };
  state.step = 360;
  return state;
}

function stayOf(state: TowerState, kind: 'officeWorker' | 'resident'): number {
  const id = addPerson(state, { kind, homeUnit: 0, level: 2, column: 50 });
  state.tripLedger[id] = [0, 0];
  const slot = slotOfPerson(state.people, id);
  addStay(state, slot);
  return stressCausesOf(state.people, slot).surroundings;
}

describe('office workers and noise', () => {
  it('lets a resident feel the noise of the cell, but not an office worker', () => {
    const state = noisyTower();
    expect(stayOf(state, 'resident')).toBeGreaterThan(0);
    expect(stayOf(state, 'officeWorker')).toBe(0);
  });
});
