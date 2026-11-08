import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { cloneState } from '../state';
import { countPeopleByKind, listPeople, NOTHING_DUE, removePeopleOfUnit } from '../people';
import { populationOf } from '../population';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';

function richTower(): TowerState {
  const { state } = buildTower(plainTowerPlan(3, 0, 80));
  state.money = 99_999_999;
  state.stars = 6;
  return state;
}

function buildSecurity(tower: TowerState, x: number, id: string): TowerState {
  const command: QueuedCommand = {
    id,
    command: { type: 'buildUnit', unitType: 'security', x, level: 2 },
  };
  const { state, results } = step(tower, [command], 0);
  expect(results[0]?.ok).toBe(true);
  return state;
}

function threeOffices(): TowerState {
  let tower = richTower();
  for (const [index, x] of [0, 20, 40].entries()) tower = buildSecurity(tower, x, `c${index}`);
  return tower;
}

describe('security guards', () => {
  it('creates 6 guards per security office, 18 for 3 offices', () => {
    const tower = threeOffices();
    expect(countPeopleByKind(tower.people)).toEqual({ guard: 18 });
  });

  it('keeps guards on duty in their office with no trip scheduled', () => {
    for (const guard of listPeople(threeOffices().people)) {
      expect(guard.trip).toBe(0);
      expect(guard.dueStep).toBe(NOTHING_DUE);
      expect(guard.stress).toBe(0);
    }
  });

  it('does not count guards in the population', () => {
    expect(populationOf(threeOffices()).total).toBe(0);
  });

  it('removes the guards of a demolished office and leaves the rest', () => {
    const tower = threeOffices();
    const [demolished] = Object.keys(tower.units);
    if (!demolished) throw new Error('No unit was built');
    const before = populationOf(tower).total;
    removePeopleOfUnit(tower, demolished);
    expect(countPeopleByKind(tower.people)).toEqual({ guard: 12 });
    expect(populationOf(tower).total).toBe(before);
  });

  it('gives guards increasing ids in creation order', () => {
    const ids = listPeople(threeOffices().people).map((guard) => Number(guard.id.slice(1)));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(18);
  });

  it('keeps guard ids after a snapshot copy', () => {
    const tower = threeOffices();
    const restored = cloneState(JSON.parse(JSON.stringify(tower)));
    expect(listPeople(restored.people)).toEqual(listPeople(tower.people));
    expect(restored.people.nextId).toBe(tower.people.nextId);
  });
});
