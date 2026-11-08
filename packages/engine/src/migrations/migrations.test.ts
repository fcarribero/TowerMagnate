import { describe, expect, it } from 'vitest';
import { createTower, SCHEMA_VERSION } from '../state';
import { newUnit } from '../units';
import { VERSION_1_SAVE, VERSION_2_SAVE, VERSION_3_SAVE, VERSION_4_SAVE } from './fixtures';
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
    tower.units.u3 = {
      ...newUnit('u3', 'fast-food', 0, -2),
      name: 'Pancho',
      paid: 100_000,
      placedAtStep: 40,
    };
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('refuses a malformed unit', () => {
    const tower = createTower(5);
    const valid = { id: 'u3', type: 'office', x: 0, level: 2, name: null };
    const purchase = {
      priceLevel: 'normal',
      paid: 40_000,
      placedAtStep: 0,
      used: false,
      lease: null,
    };
    const badUnits = [
      { ...valid, ...purchase, type: 'castle' },
      { ...valid, ...purchase, level: 0 },
      { ...valid, ...purchase, id: 'u4' },
      { ...valid, ...purchase, priceLevel: 'free' },
      { ...valid, ...purchase, paid: -1 },
      { ...valid, ...purchase, placedAtStep: 1.5 },
      { ...valid, priceLevel: 'normal', paid: 40_000, placedAtStep: 0 },
      valid,
    ];
    for (const unit of badUnits) {
      expect(() => migrateState({ ...tower, units: { u3: unit } })).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState unit leases', () => {
  function migratedUnit(unit: Record<string, unknown>): unknown {
    const tower = createTower(5);
    return migrateState({ ...tower, units: { u3: unit } }).units.u3;
  }

  it('keeps the price, used flag and lease of a rented unit', () => {
    const rented = {
      ...newUnit('u3', 'office', 0, 1),
      priceLevel: 'high',
      used: true,
      lease: { anchorStep: 100, nextDueStep: 60580 },
    };
    expect(migratedUnit(JSON.parse(JSON.stringify(rented)))).toEqual(rented);
  });

  it('refuses a malformed used flag', () => {
    const office = newUnit('u3', 'office', 0, 1);
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
      priceLevel: 'normal',
      paid: 0,
      placedAtStep: 0,
      used: false,
      lease: null,
    });
  });

  it('loads a frozen version 2 save', () => {
    const tower = migrateState(JSON.parse(VERSION_2_SAVE));
    expect(tower.units.u1).toMatchObject({
      priceLevel: 'normal',
      paid: 44_500,
      placedAtStep: 120,
      used: false,
      lease: null,
    });
  });

  it('loads a frozen version 3 save', () => {
    const tower = migrateState(JSON.parse(VERSION_3_SAVE));
    expect(tower.units.u1).toMatchObject({
      priceLevel: 'high',
      used: true,
      lease: { anchorStep: 240, nextDueStep: 60_720 },
    });
  });
});

describe('migrateState stars', () => {
  it('gives a version 3 save one star', () => {
    const tower = migrateState(JSON.parse(VERSION_3_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.stars).toBe(1);
  });

  it('loads a frozen version 4 save', () => {
    expect(migrateState(JSON.parse(VERSION_4_SAVE)).stars).toBe(3);
  });

  it('refuses a star rating outside 1 to 6', () => {
    for (const stars of [0, 7, 2.5, '3', null]) {
      const saved = { ...JSON.parse(JSON.stringify(createTower(5))), stars };
      expect(() => migrateState(saved)).toThrow(StateMigrationError);
    }
  });
});
