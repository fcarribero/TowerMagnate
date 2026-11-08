import { describe, expect, it } from 'vitest';
import { defaultSchedule } from '../commands/shafts';
import { createTower, SCHEMA_VERSION } from '../state';
import { newUnit } from '../units';
import {
  VERSION_1_SAVE,
  VERSION_2_SAVE,
  VERSION_3_SAVE,
  VERSION_4_SAVE,
  VERSION_5_SAVE,
  VERSION_6_SAVE,
  VERSION_7_SAVE,
  VERSION_8_SAVE,
  VERSION_9_SAVE,
  VERSION_11_SAVE,
} from './fixtures';
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
      sale: null,
      hotel: null,
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
    expect(tower.shafts).toEqual({});
  });

  it('loads a frozen version 3 save', () => {
    const tower = migrateState(JSON.parse(VERSION_3_SAVE));
    expect(tower.units.u1).toMatchObject({
      priceLevel: 'high',
      used: true,
      lease: { anchorStep: 240, nextDueStep: 60_720 },
    });
    expect(tower.shafts).toEqual({});
  });

  it('loads a frozen version 4 save', () => {
    const tower = migrateState(JSON.parse(VERSION_4_SAVE));
    expect(tower.shafts.s2).toMatchObject({ type: 'standard', x: 30, bottom: 1, top: 5 });
    expect(tower.shafts.s2?.cars).toEqual([
      {
        homeLevel: 1,
        level: 3,
        riders: ['p7'],
        trips: [{ destination: 3, boardedStep: 8640, waitSteps: 0 }],
        phase: 'idle',
        direction: 'idle',
        phaseStepsLeft: 0,
        assigned: [],
        paid: 80_000,
        placedAtStep: 200,
      },
    ]);
  });
});

describe('migrateState hall queues', () => {
  it('gives every shaft of a version 6 save empty queues', () => {
    const tower = migrateState(JSON.parse(VERSION_6_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.shafts.s2?.queues).toEqual({});
  });

  it('keeps the people of a version 7 save and adds empty queues', () => {
    const tower = migrateState({
      ...JSON.parse(VERSION_7_SAVE),
      shafts: { s2: { ...JSON.parse(VERSION_6_SAVE).shafts.s2 } },
    });
    expect(tower.people.id).toEqual([1, 3]);
    expect(tower.shafts.s2?.queues).toEqual({});
  });

  it('refuses queues over 40 people or with a malformed entry', () => {
    const tower = createTower(5);
    const car = {
      homeLevel: 1,
      level: 1,
      riders: [],
      phase: 'idle',
      direction: 'idle',
      phaseStepsLeft: 0,
      assigned: [],
      trips: [],
      paid: 80_000,
      placedAtStep: 0,
    };
    const shaft = (queues: unknown) => ({
      id: 's3',
      type: 'standard',
      x: 0,
      bottom: 1,
      top: 4,
      cars: [car],
      stops: [1, 2, 3, 4],
      schedule: defaultSchedule(),
      queues,
      paid: 200_000,
      placedAtStep: 0,
    });
    const entry = { person: 'p1', destination: 4, joinedStep: 3 };
    const full = Array.from({ length: 41 }, () => entry);
    const bad = [
      { '2': { up: full, down: [] } },
      { '2': { up: [{ person: 7, destination: 4, joinedStep: 3 }], down: [] } },
      { '2': { up: [] } },
    ];
    const good = { '2': { up: [entry], down: [] } };
    expect(migrateState({ ...tower, shafts: { s3: shaft(good) } }).shafts.s3?.queues).toEqual(good);
    for (const queues of bad) {
      expect(() => migrateState({ ...tower, shafts: { s3: shaft(queues) } })).toThrow(
        StateMigrationError,
      );
    }
  });
});

describe('migrateState shafts', () => {
  it('refuses a malformed shaft', () => {
    const tower = createTower(5);
    const car = {
      homeLevel: 1,
      level: 1,
      riders: [],
      phase: 'idle',
      direction: 'idle',
      phaseStepsLeft: 0,
      assigned: [],
      trips: [],
      paid: 80_000,
      placedAtStep: 0,
    };
    const valid = {
      id: 's3',
      type: 'standard',
      x: 0,
      bottom: 1,
      top: 4,
      cars: [car],
      stops: [1, 2, 3, 4],
      schedule: defaultSchedule(),
      queues: {},
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

describe('migrateState transports', () => {
  it('gives a version 4 save an empty transports record', () => {
    const tower = migrateState(JSON.parse(VERSION_4_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.transports).toEqual({});
  });

  it('loads a frozen version 5 save', () => {
    const tower = migrateState(JSON.parse(VERSION_5_SAVE));
    expect(tower.transports).toEqual({
      t2: { id: 't2', type: 'escalator', x: 20, level: 2 },
    });
  });

  it('refuses a malformed transport', () => {
    const bad = [
      { id: 't1', type: 'ramp', x: 0, level: 2 },
      { id: 't1', type: 'stairs', x: 400, level: 2 },
      { id: 't1', type: 'stairs', x: 0, level: 0 },
      { id: 't9', type: 'stairs', x: 0, level: 2 },
    ];
    for (const transport of bad) {
      const saved = JSON.parse(JSON.stringify(createTower(5)));
      saved.transports = { t1: transport };
      expect(() => migrateState(saved)).toThrow(StateMigrationError);
    }
  });

  it('migrates a version 2 save to the event state version with empty event state', () => {
    const tower = migrateState(JSON.parse(VERSION_2_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.activeEvents).toEqual([]);
    expect(tower.closedDecisions).toEqual([]);
    expect(tower.treasureLevels).toEqual([]);
  });
});

describe('migrateState stars', () => {
  it('gives a version 7 save one star', () => {
    const tower = migrateState(JSON.parse(VERSION_7_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.stars).toBe(1);
  });

  it('loads a frozen version 8 save', () => {
    expect(migrateState(JSON.parse(VERSION_8_SAVE)).stars).toBe(3);
  });

  it('loads a frozen version 11 save with every condo for sale', () => {
    const tower = migrateState(JSON.parse(VERSION_11_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.units.u1?.sale).toBeNull();
  });

  it('keeps a recorded condo sale and refuses a malformed one', () => {
    const tower = JSON.parse(JSON.stringify(migrateState(JSON.parse(VERSION_11_SAVE))));
    const sale = { price: 150_000, anchorStep: 100, nextEvaluationStep: 100 + 241_920 };
    tower.units.u1.sale = sale;
    expect(migrateState(tower).units.u1?.sale).toEqual(sale);
    tower.units.u1.sale = { ...sale, price: -1 };
    expect(() => migrateState(tower)).toThrow(StateMigrationError);
  });

  it('refuses a star rating outside 1 to 6', () => {
    for (const stars of [0, 7, 2.5, '3', null]) {
      const saved = { ...JSON.parse(JSON.stringify(createTower(5))), stars };
      expect(() => migrateState(saved)).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState star check state', () => {
  it('starts a version 8 save with no VIP approval and no failures', () => {
    const tower = migrateState(JSON.parse(VERSION_8_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower).toMatchObject({
      stars: 3,
      vipApproved: false,
      lastMedicalFailureStep: null,
      lastParkingFailureStep: null,
    });
  });
});

describe('migrateState hotel rooms', () => {
  it('loads a frozen version 9 save with clean empty rooms and no state on other units', () => {
    const tower = migrateState(JSON.parse(VERSION_9_SAVE));
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(tower.units.u1?.hotel).toBeNull();
    expect(tower.units.u3?.hotel).toEqual({ state: 'clean', stayEndStep: null });
  });

  it('keeps an occupied room with its stay end', () => {
    const tower = createTower(5);
    tower.units.u2 = {
      ...newUnit('u2', 'double-room', 0, 2),
      used: true,
      hotel: { state: 'occupied', stayEndStep: 12_960 },
    };
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('refuses a malformed hotel room', () => {
    const bad = [
      { state: 'sleeping', stayEndStep: null },
      { state: 'occupied', stayEndStep: null },
      { state: 'dirty', stayEndStep: 100 },
      { state: 'clean', stayEndStep: -1 },
    ];
    for (const hotel of bad) {
      const saved = JSON.parse(JSON.stringify(createTower(5)));
      saved.units = { u1: { ...newUnit('u1', 'suite', 0, 2), hotel } };
      expect(() => migrateState(saved)).toThrow(StateMigrationError);
    }
  });
});

describe('migrateState car motion', () => {
  it('leaves old cars idle and sends their riders to the next stop', () => {
    const tower = migrateState(JSON.parse(VERSION_4_SAVE));
    const [car] = Object.values(tower.shafts)[0]?.cars ?? [];
    expect(tower.schemaVersion).toBe(SCHEMA_VERSION);
    expect(car).toMatchObject({
      level: 3,
      phase: 'idle',
      direction: 'idle',
      phaseStepsLeft: 0,
      assigned: [],
      trips: [{ destination: 3, boardedStep: 8640, waitSteps: 0 }],
    });
  });

  it('gives old shafts every level as a stop and the default schedule', () => {
    const tower = migrateState(JSON.parse(VERSION_4_SAVE));
    const shaft = Object.values(tower.shafts)[0];
    expect(shaft?.stops).toEqual(
      Array.from(
        { length: (shaft?.top ?? 0) - (shaft?.bottom ?? 0) + 1 },
        (_, i) => (shaft?.bottom ?? 0) + i,
      ),
    );
    expect(shaft?.schedule.weekday).toHaveLength(6);
    expect(shaft?.schedule.weekend[5]).toEqual({
      mode: 'normal',
      dwellSeconds: 30,
      responseDistance: 5,
    });
  });

  it('gives queued people the far end of the shaft as destination', () => {
    const saved = JSON.parse(JSON.stringify(createTower(5)));
    saved.schemaVersion = 11;
    saved.shafts = {
      s2: {
        id: 's2',
        type: 'standard',
        x: 30,
        bottom: 1,
        top: 5,
        cars: [{ homeLevel: 1, level: 1, riders: [], paid: 0, placedAtStep: 0 }],
        queues: { '2': { up: [{ person: 'p1', joinedStep: 4 }], down: [] } },
        paid: 0,
        placedAtStep: 0,
      },
    };
    const queue = migrateState(saved).shafts.s2?.queues['2'];
    expect(queue?.up).toEqual([{ person: 'p1', destination: 5, joinedStep: 4 }]);
  });
});
