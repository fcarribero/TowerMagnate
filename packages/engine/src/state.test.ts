import { describe, expect, it } from 'vitest';
import { addPerson } from './people';
import { cloneState, createTower, SCHEMA_VERSION } from './state';

describe('createTower', () => {
  it('starts at step 0 with the current schema version', () => {
    const tower = createTower(1);
    expect(tower.step).toBe(0);
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.nextId).toBe(1);
  });

  it('starts with an empty grid and no lobby heights', () => {
    expect(createTower(1).grid).toEqual({ levels: {}, mainLobbyHeight: null, skyLobbyHeights: {} });
  });

  it('derives the rng from the seed', () => {
    expect(createTower(1)).toEqual(createTower(1));
    expect(createTower(1).rng).not.toEqual(createTower(2).rng);
  });

  it('is plain JSON-safe data', () => {
    const tower = createTower(99);
    expect(JSON.parse(JSON.stringify(tower))).toEqual(tower);
  });

  it('rejects a fractional seed', () => {
    expect(() => createTower(1.5)).toThrow(RangeError);
  });

  it('starts with nobody in the tower', () => {
    expect(createTower(1).people.id).toEqual([]);
    expect(createTower(1).people.nextId).toBe(1);
  });
});

describe('cloneState', () => {
  it('copies the tower, people included, without sharing anything', () => {
    const tower = createTower(4);
    addPerson(tower, { kind: 'maid', homeUnit: 3, level: 5, column: 20 });
    tower.people.followed.push(1);
    const copy = cloneState(tower);
    expect(copy).toEqual(tower);

    copy.people.stress[0] = 9;
    copy.people.followed.length = 0;
    copy.grid.mainLobbyHeight = 2;
    expect(tower.people.stress[0]).toBe(0);
    expect(tower.people.followed).toEqual([1]);
    expect(tower.grid.mainLobbyHeight).toBeNull();
  });

  it('stays plain JSON-safe data with people in it', () => {
    const tower = createTower(4);
    addPerson(tower, { kind: 'guard', homeUnit: 1, level: -2, column: 3 });
    expect(JSON.parse(JSON.stringify(cloneState(tower)))).toEqual(tower);
  });
});
