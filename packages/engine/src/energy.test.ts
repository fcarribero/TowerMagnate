import { describe, expect, it } from 'vitest';
import { baseEnergy, drainEnergy, leaveHome, resetEnergy, restEnergy } from './energy';
import { addPerson, createPersonPool } from './people';
import { buildTower, plainTowerPlan } from './testing/tower-builder';

describe('energy', () => {
  it('draws levels 5 and 6 much more often than 1 or 10', () => {
    const counts = new Array<number>(11).fill(0);
    for (let seed = 0; seed < 20_000; seed++) {
      counts[baseEnergy(Math.floor((seed / 20_000) * 2 ** 32)) / 1_000] += 1;
    }
    expect(counts[5]! + counts[6]!).toBeGreaterThan(counts[1]! * 6);
    expect(counts[5]! + counts[6]!).toBeGreaterThan(counts[10]! * 6);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[10]).toBeGreaterThan(0);
  });

  it('keeps createPersonPool empty of energy', () => {
    expect(createPersonPool().energy).toEqual([]);
  });
});

describe('energy over time', () => {
  function pool(kind: 'officeWorker' | 'resident') {
    const { state } = buildTower(plainTowerPlan(3, 0, 100));
    const id = addPerson(state, { kind, homeUnit: 0, level: 1, column: 10 });
    return { pool: state.people, slot: state.people.id.indexOf(id) };
  }

  it('wears down a worker inside a unit', () => {
    const { pool: people, slot } = pool('officeWorker');
    const before = people.energy[slot] as number;
    restEnergy(people, slot);
    expect(people.energy[slot]).toBeLessThanOrEqual(before);
  });

  it('restores a resident at home, up to their own level, after stepping out tired', () => {
    const { pool: people, slot } = pool('resident');
    const own = people.energy[slot] as number;
    leaveHome(people, slot);
    const tired = people.energy[slot] as number;
    expect(tired).toBeLessThanOrEqual(own);
    for (let step = 0; step < 5_000; step++) restEnergy(people, slot);
    expect(people.energy[slot]).toBe(own);
  });

  it('never goes under level 1 and resets at night', () => {
    const { pool: people, slot } = pool('officeWorker');
    drainEnergy(people, slot, 1_000_000);
    expect(people.energy[slot]).toBe(1_000);
    resetEnergy(people);
    expect(people.energy[slot]).toBeGreaterThanOrEqual(1_000);
  });
});
