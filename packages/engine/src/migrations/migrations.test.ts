import { describe, expect, it } from 'vitest';
import { createTower, SCHEMA_VERSION } from '../state';
import { newUnit } from '../units';
import { VERSION_1_SAVE } from './fixtures';
import { migrateState, StateMigrationError } from './index';

describe('migrateState', () => {
  it('loads a current-version state unchanged', () => {
    const tower = createTower(123);
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('refuses a state from a newer engine', () => {
    const fromTheFuture = { ...createTower(1), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrateState(fromTheFuture)).toThrow(StateMigrationError);
  });

  it('refuses data that is not a tower state', () => {
    expect(() => migrateState(null)).toThrow(StateMigrationError);
    expect(() => migrateState({ schemaVersion: 0 })).toThrow(StateMigrationError);
    expect(() => migrateState({ ...createTower(1), step: -1 })).toThrow(StateMigrationError);
    expect(() => migrateState({ ...createTower(1), rng: { a: 1, b: 2, c: 3 } })).toThrow(
      StateMigrationError,
    );
  });
});

describe('migrateState units', () => {
  it('gives a tower saved without units an empty units record', () => {
    const savedBeforeUnits: Record<string, unknown> = { ...createTower(5) };
    delete savedBeforeUnits.units;
    expect(migrateState(savedBeforeUnits).units).toEqual({});
  });

  it('keeps well-formed units', () => {
    const tower = createTower(5);
    tower.units.u3 = { ...newUnit('u3', 'fast-food', 0, -2), name: 'Pancho' };
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('refuses a malformed unit', () => {
    const tower = createTower(5);
    const badUnits = [
      { id: 'u3', type: 'castle', x: 0, level: 1, name: null },
      { id: 'u3', type: 'office', x: 0, level: 0, name: null },
      { id: 'u4', type: 'office', x: 0, level: 1, name: null },
    ];
    for (const unit of badUnits) {
      expect(() => migrateState({ ...tower, units: { u3: unit } })).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState unit prices and leases', () => {
  function migratedUnit(unit: Record<string, unknown>): unknown {
    const tower = createTower(5);
    return migrateState({ ...tower, units: { u3: unit } }).units.u3;
  }

  const savedBeforeLeases = { id: 'u3', x: 0, level: 1, name: null };

  it('gives units saved before leases the values of a new unit', () => {
    expect(migratedUnit({ ...savedBeforeLeases, type: 'office' })).toEqual(
      newUnit('u3', 'office', 0, 1),
    );
    expect(migratedUnit({ ...savedBeforeLeases, type: 'retail-shop' })).toMatchObject({
      price: 'normal',
      used: false,
      lease: null,
    });
    expect(migratedUnit({ ...savedBeforeLeases, type: 'fast-food' })).toMatchObject({
      price: null,
    });
  });

  it('keeps the price, used flag and lease of a rented unit', () => {
    const rented = {
      ...newUnit('u3', 'office', 0, 1),
      price: 'high',
      used: true,
      lease: { anchorStep: 100, nextDueStep: 60580 },
    };
    expect(migratedUnit(JSON.parse(JSON.stringify(rented)))).toEqual(rented);
  });

  it('refuses an unknown price level or a malformed used flag', () => {
    const office = newUnit('u3', 'office', 0, 1);
    expect(() => migratedUnit({ ...office, price: 'gratis' })).toThrow(StateMigrationError);
    expect(() => migratedUnit({ ...office, used: 'yes' })).toThrow(StateMigrationError);
  });

  it('refuses a malformed lease', () => {
    const office = newUnit('u3', 'office', 0, 1);
    const badLeases = [
      'u3',
      { anchorStep: 100 },
      { anchorStep: -1, nextDueStep: 60479 },
      { anchorStep: 100, nextDueStep: 100 },
      { anchorStep: 1.5, nextDueStep: 60480 },
    ];
    for (const lease of badLeases) {
      expect(() => migratedUnit({ ...office, lease })).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState fixtures', () => {
  it('loads a frozen version 1 save', () => {
    const tower = migrateState(JSON.parse(VERSION_1_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.step).toBe(8640);
    expect(tower.units.u1).toEqual({
      id: 'u1',
      type: 'office',
      x: 10,
      level: 1,
      name: 'Sur',
      price: 'normal',
      used: false,
      lease: null,
    });
  });
});
