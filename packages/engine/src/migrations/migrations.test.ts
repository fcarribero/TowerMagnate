import { describe, expect, it } from 'vitest';
import { createTower, SCHEMA_VERSION } from '../state';
import { VERSION_1_SAVE, VERSION_2_SAVE, VERSION_3_SAVE } from './fixtures';
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
      id: 'u3',
      type: 'fast-food',
      x: 0,
      level: -2,
      name: 'Pancho',
      priceLevel: 'normal',
      paid: 100_000,
      placedAtStep: 40,
    };
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('refuses a malformed unit', () => {
    const tower = createTower(5);
    const valid = { id: 'u3', type: 'office', x: 0, level: 2, name: null };
    const purchase = { priceLevel: 'normal', paid: 40_000, placedAtStep: 0 };
    const badUnits = [
      { ...valid, ...purchase, type: 'castle' },
      { ...valid, ...purchase, level: 0 },
      { ...valid, ...purchase, id: 'u4' },
      { ...valid, ...purchase, priceLevel: 'free' },
      { ...valid, ...purchase, paid: -1 },
      { ...valid, ...purchase, placedAtStep: 1.5 },
      valid,
    ];
    for (const unit of badUnits) {
      expect(() => migrateState({ ...tower, units: { u3: unit } })).toThrow(StateMigrationError);
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
    });
  });

  it('loads a frozen version 2 save', () => {
    const tower = migrateState(JSON.parse(VERSION_2_SAVE));
    expect(tower.units.u1).toMatchObject({ priceLevel: 'normal', paid: 44_500, placedAtStep: 120 });
    expect(tower.shafts).toEqual({});
  });

  it('loads a frozen version 3 save', () => {
    const tower = migrateState(JSON.parse(VERSION_3_SAVE));
    expect(tower.shafts.s2).toMatchObject({ type: 'standard', x: 30, bottom: 1, top: 5 });
    expect(tower.shafts.s2?.cars).toEqual([
      { homeLevel: 1, level: 3, riders: ['p7'], paid: 80_000, placedAtStep: 200 },
    ]);
  });
});

describe('migrateState shafts', () => {
  it('refuses a malformed shaft', () => {
    const tower = createTower(5);
    const car = { homeLevel: 1, level: 1, riders: [], paid: 80_000, placedAtStep: 0 };
    const valid = {
      id: 's3',
      type: 'standard',
      x: 0,
      bottom: 1,
      top: 4,
      cars: [car],
      paid: 200_000,
      placedAtStep: 0,
    };
    const badShafts = [
      { ...valid, type: 'glass' },
      { ...valid, bottom: 5 },
      { ...valid, cars: [] },
      { ...valid, cars: [{ ...car, riders: [7] }] },
      { ...valid, id: 's4' },
    ];
    expect(
      migrateState(JSON.parse(JSON.stringify({ ...tower, shafts: { s3: valid } }))).shafts.s3,
    ).toEqual(valid);
    for (const shaft of badShafts) {
      expect(() => migrateState({ ...tower, shafts: { s3: shaft } })).toThrow(StateMigrationError);
    }
  });
});
