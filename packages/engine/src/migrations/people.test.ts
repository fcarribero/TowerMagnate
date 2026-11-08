import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from '../clock';
import { hashState } from '../hash';
import {
  addPerson,
  createPeopleSystem,
  createPersonPool,
  followPerson,
  personAt,
  removePerson,
  setDueStep,
} from '../people';
import { chance, nextInt } from '../rng';
import { deserializeState, serializeState } from '../serialization';
import { createTower } from '../state';
import { createEngine } from '../step';
import { VERSION_2_SAVE, VERSION_3_SAVE, VERSION_4_SAVE, VERSION_7_SAVE } from './fixtures';
import { migrateState, StateMigrationError } from './index';

function towerWithPeople(count: number) {
  const tower = createTower(1);
  for (let index = 0; index < count; index++) {
    addPerson(tower, { kind: 'resident', homeUnit: 0, level: 2, column: index % 300 });
  }
  return tower;
}

function savedPeople(tower = towerWithPeople(3)): Record<string, unknown> {
  return JSON.parse(serializeState(tower));
}

describe('reading the person pool', () => {
  it('starts a version 2 save with an empty pool', () => {
    expect(migrateState(JSON.parse(VERSION_2_SAVE)).people).toEqual(createPersonPool());
  });

  it('starts a version 3 save with an empty pool', () => {
    expect(migrateState(JSON.parse(VERSION_3_SAVE)).people).toEqual(createPersonPool());
  });

  it('starts a version 4 save with an empty pool', () => {
    expect(migrateState(JSON.parse(VERSION_4_SAVE)).people).toEqual(createPersonPool());
  });

  it('loads a frozen version 7 save with its people', () => {
    const { people } = migrateState(JSON.parse(VERSION_7_SAVE));
    expect(people.nextId).toBe(4);
    expect(personAt(people, 1)).toMatchObject({ id: 'p3', kind: 'hotelGuest', level: 5 });
    expect(people.stress).toEqual([0, 12.5]);
    expect(people.followed).toEqual([3]);
  });

  it('refuses a current save without a pool', () => {
    const saved: Record<string, unknown> = JSON.parse(serializeState(createTower(1)));
    delete saved.people;
    expect(() => migrateState(saved)).toThrow(StateMigrationError);
  });

  it('loads a tower with nobody in it', () => {
    const saved = JSON.parse(JSON.stringify(createTower(1)));
    expect(migrateState(saved).people).toEqual(createPersonPool());
  });

  it('restores 1,000 people with their follow flags and id counter', () => {
    const tower = towerWithPeople(1000);
    removePerson(tower, 500);
    followPerson(tower.people, 7);
    followPerson(tower.people, 999);

    const restored = deserializeState(serializeState(tower));

    expect(restored.people).toEqual(tower.people);
    expect(hashState(restored)).toBe(hashState(tower));
    expect(addPerson(restored, { kind: 'maid', homeUnit: 0, level: 2, column: 0 })).toBe(1001);
  });

  it.each([
    ['a missing field', (people: Record<string, unknown>) => delete people.trip],
    ['a short field', (people: Record<string, unknown>) => (people.level as number[]).pop()],
    ['ids out of order', (people: Record<string, unknown>) => (people.id = [2, 1, 3])],
    ['an id at or past nextId', (people: Record<string, unknown>) => (people.nextId = 3)],
    ['an unknown kind', (people: Record<string, unknown>) => ((people.kind as number[])[0] = 99)],
    ['a follow of nobody', (people: Record<string, unknown>) => (people.followed = [42])],
  ])('refuses a pool with %s', (_case, corrupt) => {
    const saved = savedPeople();
    corrupt(saved.people as Record<string, unknown>);
    expect(() => migrateState(saved)).toThrow(StateMigrationError);
  });
});

describe('a restored person pool', () => {
  const engine = createEngine({
    commandHandlers: {},
    systems: [
      createPeopleSystem((context, slot) => {
        const { state } = context;
        const person = personAt(state.people, slot);
        const id = Number(person.id.slice(1));
        state.people.column[slot] = nextInt(state.rng, 0, 299);
        state.people.stress[slot] = (state.people.stress[slot] ?? 0) + nextInt(state.rng, 0, 30);
        setDueStep(state.people, id, state.step + nextInt(state.rng, 1, 60));
        if (chance(state.rng, 0.01)) removePerson(state, id);
        if (chance(state.rng, 0.01)) {
          const added = addPerson(state, { kind: 'customer', homeUnit: 0, level: 1, column: 0 });
          setDueStep(state.people, added, state.step + 1);
        }
      }),
    ],
  });

  function busyTower(): TowerState {
    const tower = towerWithPeople(1000);
    for (let id = 1; id <= 1000; id++) setDueStep(tower.people, id, 1 + (id % 50));
    followPerson(tower.people, 10);
    return engine.step(tower, [], 500).state;
  }

  function runBoth(steps: number): { uninterrupted: TowerState; restored: TowerState } {
    const saved = busyTower();
    return {
      uninterrupted: engine.step(saved, [], steps).state,
      restored: engine.step(deserializeState(serializeState(saved)), [], steps).state,
    };
  }

  it('runs the next 1,000 steps exactly like a pool that was never saved', () => {
    const { uninterrupted, restored } = runBoth(1000);
    expect(uninterrupted.people.nextId).toBeGreaterThan(1001);
    expect(hashState(restored)).toBe(hashState(uninterrupted));
  });

  it('runs a whole day exactly like a pool that was never saved', () => {
    const { uninterrupted, restored } = runBoth(STEPS_PER_DAY);
    expect(restored.people).toEqual(uninterrupted.people);
    expect(hashState(restored)).toBe(hashState(uninterrupted));
  });
});
