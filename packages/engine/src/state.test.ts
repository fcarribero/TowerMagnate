import { describe, expect, it } from 'vitest';
import { createTower, SCHEMA_VERSION } from './state';

describe('createTower', () => {
  it('starts at step 0 with the current schema version', () => {
    const tower = createTower(1);
    expect(tower.step).toBe(0);
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.nextId).toBe(1);
  });

  it('starts with $2,000,000 and an empty ledger', () => {
    const tower = createTower(1);
    expect(tower.money).toBe(2_000_000);
    expect(tower.ledger.currentWeek.rent).toEqual({ income: 0, expense: 0 });
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
});
