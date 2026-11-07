import { describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { addPerson, createPersonPool, followPerson, removePerson } from '../people';
import { deserializeState, serializeState } from '../serialization';
import { createTower } from '../state';
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
  it('starts towers saved before people existed with an empty pool', () => {
    const saved: Record<string, unknown> = JSON.parse(JSON.stringify(createTower(1)));
    delete saved.people;
    expect(migrateState(saved).people).toEqual(createPersonPool());
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
