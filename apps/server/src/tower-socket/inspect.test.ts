import {
  addPerson,
  createTower,
  defaultSchedule,
  encodePoliceRoutine,
  encodeStaffRoutine,
  newUnit,
  removePerson,
  renamePerson,
  setStructure,
  STEPS_PER_DAY,
  STEPS_PER_MINUTE,
} from '@tower-magnate/engine';
import {
  ServerMessageSchema,
  serverMessage,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { inspectPerson, inspectShaft, inspectUnit } from './inspect';
import { addOfficeWorker } from './testPeople';

const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;

function towerWith(type: Parameters<typeof newUnit>[1]): { state: TowerState; id: string } {
  const state = createTower(3);
  state.units.u7 = newUnit('u7', type, 10, 4);
  return { state, id: 'u7' };
}

function unitOf(state: TowerState): Unit {
  const unit = state.units.u7;
  if (!unit) {
    throw new Error('Unit u7 is missing');
  }
  return unit;
}

function addOfficeWorkers(state: TowerState, unitNumber: number, count: number): void {
  for (let index = 0; index < count; index += 1) {
    addOfficeWorker(state, { homeUnit: unitNumber, level: 4, column: 10 });
  }
}

function throughTheWire(data: ReturnType<typeof inspectUnit>) {
  const message = JSON.parse(JSON.stringify(serverMessage('inspect', data)));
  return ServerMessageSchema.safeParse(message).success;
}

describe('inspecting a unit', () => {
  it('lists the upgrades of a security office with their levels and the next price', () => {
    const { state, id } = towerWith('security');
    const unit = state.units[id];
    if (unit) unit.upgrades = { cameras: 1, accessControl: 2 };

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      upgrades: [
        { id: 'cameras', level: 1, maxLevel: 3, nextPrice: 50_000 },
        { id: 'guards', level: 0, maxLevel: 3, nextPrice: 25_000 },
        { id: 'fireSystem', level: 0, maxLevel: 3, nextPrice: 25_000 },
        { id: 'accessControl', level: 2, maxLevel: 2, nextPrice: null },
      ],
    });
  });

  it('answers an office for rent with the common fields and lease fields', () => {
    const { state, id } = towerWith('office');

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toEqual({
      kind: 'unit',
      id: 'u7',
      status: 'ok',
      name: null,
      type: 'office',
      level: 4,
      from: 10,
      to: 18,
      upgrades: [],
      details: {
        group: 'lease',
        state: 'forRent',
        persons: 0,
        capacity: 6,
        evaluation: null,
        price: 10_000,
        appraisal: 10_000,
        priceBand: 'normal',
        priceMin: 4_000,
        priceMax: 25_000,
        priceStep: 1,
        listed: true,
        weeklyRent: null,
        nextPaymentStep: null,
        workers: [],
        customers: [],
        evaluationParts: {
          baseMinutes: 0,
          price: 0,
          minimumPrice: false,
          noisy: false,
          mainCause: null,
        },
      },
    });
  });

  it('shows a let office with its persons, and next payment', () => {
    const { state, id } = towerWith('office');
    unitOf(state).name = 'Oficinas';
    unitOf(state).lease = { anchorStep: 0, nextDueStep: 2 * STEPS_PER_WEEK, weekVisits: 0, rent: 10_000 };
    state.step = STEPS_PER_WEEK + 5;
    addOfficeWorkers(state, 7, 6);

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      name: 'Oficinas',
      details: {
        state: 'occupied',
        persons: 6,
        nextPaymentStep: 2 * STEPS_PER_WEEK,
      },
    });
  });


  it('answers a shop like an office', () => {
    const { state, id } = towerWith('retail-shop');

    expect(inspectUnit(state, id)).toMatchObject({
      type: 'retail-shop',
      details: { group: 'lease', state: 'forRent' },
    });
  });

  it('shows the stored grade of the unit', () => {
    const { state, id } = towerWith('retail-shop');
    unitOf(state).evaluation = 'poor';

    expect(inspectUnit(state, id)).toMatchObject({ details: { evaluation: 'poor' } });
  });

  it('answers a condo for sale and a sold one', () => {
    const { state, id } = towerWith('condo');
    const forSale = inspectUnit(state, id);

    expect(throughTheWire(forSale)).toBe(true);
    expect(forSale).toMatchObject({
      details: { group: 'condo', state: 'forSale', residents: [], residentCount: 0, capacity: 3 },
    });

    unitOf(state).sale = { price: 1, anchorStep: 0, nextEvaluationStep: 999 };
    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'sold', nextEvaluationStep: 999 },
    });
  });

  it('answers a free hotel room and an occupied one with its checkout', () => {
    const { state, id } = towerWith('double-room');
    const free = inspectUnit(state, id);

    expect(throughTheWire(free)).toBe(true);
    expect(free).toMatchObject({
      details: { group: 'hotel', state: 'clean', guests: 0, capacity: 2, checkoutStep: null },
    });

    unitOf(state).hotel = {
      state: 'occupied',
      stayEndStep: 5000,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    };
    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'occupied', checkoutStep: 5000 },
    });
  });

  it('lists the guests of a hotel room as tenants', () => {
    const { state, id } = towerWith('double-room');
    const guest = addPerson(state, { kind: 'hotelGuest', homeUnit: 7, level: 4, column: 10 });
    unitOf(state).hotel = {
      state: 'occupied',
      stayEndStep: 5000,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    };
    const data = inspectUnit(state, id);
    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ details: { group: 'hotel', tenants: [`p${guest}`] } });
  });

  it('hides the checkout of a room that is not occupied', () => {
    const { state, id } = towerWith('suite');
    unitOf(state).hotel = {
      state: 'dirty',
      stayEndStep: 5000,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    };

    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'dirty', checkoutStep: null },
    });
  });

  it('answers a cinema with the age of its film', () => {
    const { state, id } = towerWith('cinema');
    state.step = 15 * STEPS_PER_DAY;
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      type: 'cinema',
      details: { group: 'cinema', filmWeek: 3, filmAgeDays: 15 },
    });
  });

  it('lists the crew of a fast food and does not count them as inside', () => {
    const { state, id } = towerWith('fast-food');
    unitOf(state).hours = { open: 9, close: 18 };
    unitOf(state).enabled = false;
    for (const phase of ['working', 'working', 'outside'] as const) {
      const person = addPerson(state, { kind: 'staff', homeUnit: 7, level: 4, column: 10 });
      const slot = state.people.id.indexOf(person);
      state.people.trip[slot] = encodeStaffRoutine({ phase, entranceOnRight: false });
    }
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      details: {
        group: 'venue',
        workers: ['p1', 'p2', 'p3'],
        workersInside: 2,
        customers: [],
        inside: 0,
        hours: { open: 9, close: 18 },
        enabled: false,
        activeToday: true,
      },
    });
  });

  it('gives an office the appraisal, band, price bounds and locked rent', () => {
    const { state, id } = towerWith('office');
    unitOf(state).price = 12_000;
    unitOf(state).appraisal = 10_000;
    unitOf(state).listed = true;
    unitOf(state).lease = { anchorStep: 0, nextDueStep: STEPS_PER_WEEK, weekVisits: 0, rent: 9_000 };

    expect(inspectUnit(state, id)).toMatchObject({
      details: {
        appraisal: 10_000,
        priceBand: 'high',
        priceMin: 4_000,
        priceMax: 25_000,
        priceStep: 1,
        listed: true,
        weeklyRent: 9_000,
      },
    });
  });

  it('answers a fast food with its customers, hours, result and hourly chart', () => {
    const { state, id } = towerWith('fast-food');
    state.step = 2 * STEPS_PER_DAY + 10 * 60 * STEPS_PER_MINUTE;
    const venue = unitOf(state).venue;
    if (!venue) throw new Error('not a venue');
    venue.visits = 30;
    venue.hourly = [0, 0, 0, 0, 0, 0, 0, 0, 5, 12, 13];
    venue.pastHourly = [[0, 0, 0, 0, 0, 0, 0, 0, 10, 20]];
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      details: {
        group: 'venue',
        served: 30,
        inside: 0,
        opens: 8,
        closes: 20,
        resultToday: 2_500,
        today: [5, 12, 13],
      },
    });
    const details = data.status === 'ok' ? data.details : null;
    expect(details?.group === 'venue' && details.average).toHaveLength(12);
  });

  it('answers a housekeeping unit with its working maids and the dirty rooms of the tower', () => {
    const { state, id } = towerWith('housekeeping');
    const dirtyRoom = newUnit('u8', 'single-room', 40, 4);
    dirtyRoom.hotel = {
      state: 'dirty',
      stayEndStep: null,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 1,
    };
    state.units.u8 = dirtyRoom;
    state.units.u9 = newUnit('u9', 'suite', 60, 4);

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      type: 'housekeeping',
      details: { group: 'housekeeping', maidsWorking: 0, maids: 6, dirtyRooms: 1 },
    });
  });

  it('answers other unit types with the common fields only', () => {
    const { state, id } = towerWith('security');
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ status: 'ok', type: 'security', details: { group: 'security' } });
  });

  it('answers a recycling center with the common fields only', () => {
    const { state, id } = towerWith('recycling-center');
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ status: 'ok', type: 'recycling-center', details: null });
  });

  it('lists the maids of a housekeeping unit', () => {
    const { state, id } = towerWith('housekeeping');
    const first = addPerson(state, { kind: 'maid', homeUnit: 7, level: 4, column: 10 });
    const second = addPerson(state, { kind: 'maid', homeUnit: 7, level: 4, column: 11 });
    addPerson(state, { kind: 'maid', homeUnit: 8, level: 4, column: 12 });

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ details: { group: 'housekeeping', workers: [`p${first}`, `p${second}`] } });
  });

  it('lists only the officers on duty of a security office', () => {
    const { state, id } = towerWith('security');
    const on = addPerson(state, { kind: 'police', homeUnit: 7, level: 4, column: 10 });
    const off = addPerson(state, { kind: 'police', homeUnit: 7, level: 4, column: 11 });
    state.people.trip[state.people.id.indexOf(on)] = encodePoliceRoutine({
      phase: 'working',
      entranceOnRight: false,
    });
    state.people.trip[state.people.id.indexOf(off)] = encodePoliceRoutine({
      phase: 'off',
      entranceOnRight: false,
    });

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ details: { group: 'security', officers: [`p${on}`] } });
  });

  it('lists the audience and crew of a cinema, and the guests of a party hall', () => {
    const { state, id } = towerWith('cinema');
    const viewer = addPerson(state, { kind: 'audience', homeUnit: 7, level: 4, column: 10 });
    state.people.trip[state.people.id.indexOf(viewer)] = 2;
    const crew = addPerson(state, { kind: 'staff', homeUnit: 7, level: 4, column: 11 });

    const cinema = inspectUnit(state, id);
    expect(throughTheWire(cinema)).toBe(true);
    expect(cinema).toMatchObject({
      details: { group: 'cinema', workers: [`p${crew}`], customers: [`p${viewer}`] },
    });

    state.units.u7 = newUnit('u7', 'party-hall', 10, 4);
    const hall = inspectUnit(state, 'u7');
    expect(throughTheWire(hall)).toBe(true);
    expect(hall).toMatchObject({
      details: { group: 'visit', workers: [`p${crew}`], customers: [`p${viewer}`] },
    });
  });

  it('shows a construction site as a unit that is being built, with no points', () => {
    const state = createTower(3);
    state.sites.u8 = {
      id: 'u8',
      type: 'office',
      x: 10,
      level: 4,
      paid: 100,
      placedAtStep: 0,
      points: 5,
    };
    expect(inspectUnit(state, 'u8')).toEqual({
      kind: 'unit',
      id: 'u8',
      status: 'ok',
      name: null,
      type: 'office',
      level: 4,
      from: 10,
      to: 18,
      upgrades: [],
      details: {
        group: 'construction',
        price: 10_000,
        appraisal: 10_000,
        priceBand: 'normal',
        priceMin: 4_000,
        priceMax: 25_000,
        priceStep: 1,
        priority: false,
        listed: true,
      },
    });
  });

  it('shows the price a player chose on a site and no price for a lift', () => {
    const state = createTower(3);
    state.sites.u8 = {
      id: 'u8',
      type: 'office',
      x: 10,
      level: 4,
      paid: 100,
      placedAtStep: 0,
      points: 5,
      price: 7_000,
      listed: false,
    };
    state.sites.u9 = { id: 'u9', type: 'security', x: 0, level: 4, paid: 0, placedAtStep: 0, points: 0 };
    const office = inspectUnit(state, 'u8');
    expect(throughTheWire(office)).toBe(true);
    expect(office).toMatchObject({
      details: { group: 'construction', price: 7_000, priceBand: 'low', listed: false, priority: false },
    });
    state.sites.u9!.priority = true;
    expect(inspectUnit(state, 'u9')).toMatchObject({ details: { group: 'construction', priority: true } });
    expect((inspectUnit(state, 'u9') as { details: object }).details).not.toHaveProperty('price');
  });

  it('answers gone for an unknown unit', () => {
    const state = createTower(3);

    expect(inspectUnit(state, 'u99')).toEqual({ kind: 'unit', id: 'u99', status: 'gone' });
    expect(inspectUnit(state, 'constructor')).toEqual({
      kind: 'unit',
      id: 'constructor',
      status: 'gone',
    });
  });

  it('answers in under a millisecond in a 15,000 person tower', () => {
    const { state, id } = towerWith('office');
    for (let index = 0; index < 15_000; index += 1) {
      addOfficeWorker(state, { homeUnit: 1 + (index % 2500), level: 2, column: 5 });
    }
    inspectUnit(state, id);

    const started = performance.now();
    for (let run = 0; run < 100; run += 1) {
      inspectUnit(state, id);
    }

    expect((performance.now() - started) / 100).toBeLessThan(1);
  });
});

function carAt(homeLevel: number) {
  return {
    homeLevel,
    level: homeLevel,
    riders: [] as string[],
    trips: [],
    phase: 'idle' as const,
    direction: 'idle' as const,
    phaseStepsLeft: 0,
    assigned: [],
    paid: 0,
    placedAtStep: 0,
  };
}

function towerWithShaft(
  type: 'standard' | 'express' | 'service',
  homes: number[],
  stops: number[],
): TowerState {
  const state = createTower(3);
  state.shafts.s3 = {
    id: 's3',
    type,
    x: 30,
    bottom: stops[0] ?? 1,
    top: stops[stops.length - 1] ?? 1,
    stops,
    schedule: defaultSchedule(),
    cars: homes.map(carAt),
    queues: {},
    paid: 0,
    placedAtStep: 0,
  };
  return state;
}

describe('inspecting a shaft', () => {
  it('answers a standard shaft with its stops, cars and home levels', () => {
    const state = towerWithShaft('standard', [1, 3], [1, 2, 3]);
    state.shafts.s3?.cars[1]?.riders.push('p1', 'p2');

    const data = inspectShaft(state, 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      kind: 'shaft',
      id: 's3',
      status: 'ok',
      type: 'standard',
      bottom: 1,
      top: 3,
      stops: [1, 2, 3],
      cars: [
        { index: 0, homeLevel: 1, load: 0 },
        { index: 1, homeLevel: 3, load: 2 },
      ],
    });
  });

  it('answers an express shaft with its express levels', () => {
    const state = towerWithShaft('express', [1], [1, 15, 30]);

    const data = inspectShaft(state, 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ type: 'express', stops: [1, 15, 30] });
  });

  it('answers a service shaft', () => {
    const data = inspectShaft(towerWithShaft('service', [2], [1, 2]), 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ type: 'service', stops: [1, 2] });
  });

  it('answers gone for a removed or unknown shaft', () => {
    const state = towerWithShaft('standard', [1], [1, 2]);
    delete state.shafts.s3;

    expect(inspectShaft(state, 's3')).toEqual({ kind: 'shaft', id: 's3', status: 'gone' });
    expect(inspectShaft(state, 'constructor')).toEqual({
      kind: 'shaft',
      id: 'constructor',
      status: 'gone',
    });
    expect(throughTheWire(inspectShaft(state, 's3'))).toBe(true);
  });

  it('leaves unit inspection unchanged', () => {
    const { state, id } = towerWith('office');

    expect(inspectUnit(state, id)).toMatchObject({ kind: 'unit', status: 'ok', type: 'office' });
  });

  it('answers in under half a millisecond for 8 cars and 100 levels', () => {
    const levels = Array.from({ length: 100 }, (_, index) => index + 1);
    const state = towerWithShaft('standard', [1, 10, 20, 30, 40, 50, 60, 70], levels);
    inspectShaft(state, 's3');

    const started = performance.now();
    for (let run = 0; run < 100; run += 1) {
      inspectShaft(state, 's3');
    }

    expect((performance.now() - started) / 100).toBeLessThan(0.5);
  });
});

describe('inspecting a person', () => {
  const TREK_WALKING_TO_DESTINATION = 1;
  const TREK_ON_STAIRS = 5;
  const TREK_QUEUED = 7;
  const TREK_RIDING = 9;
  const TREK_NO_ROUTE = 10;

  function towerWithWorker(): { state: TowerState; id: string } {
    const { state } = towerWith('office');
    addOfficeWorker(state, { homeUnit: 7, level: 4, column: 12 });
    return { state, id: 'p1' };
  }

  it('answers a person at rest with the name, kind and home unit', () => {
    const { state, id } = towerWithWorker();
    renamePerson(state.people, 1, 'Ana');

    const data = inspectPerson(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toEqual({
      kind: 'person',
      id: 'p1',
      status: 'ok',
      name: 'Ana',
      personKind: 'officeWorker',
      state: 'inside',
      destination: null,
      stressMinutes: 0,
      stress: 'normal',
      stressCauses: {
        wait: 0,
        ride: 0,
        stairs: 0,
        queue: 0,
        noRoute: 0,
        walk: 0,
        surroundings: 0,
        calm: 0,
      },
      homeUnitId: 'u7',
    });
  });

  it('has no name and no home unit for an unnamed visitor', () => {
    const state = createTower(3);
    addPerson(state, { kind: 'customer', homeUnit: 0, level: 1, column: 5 });

    expect(inspectPerson(state, 'p1')).toMatchObject({ name: null, homeUnitId: null });
  });

  it('gives the stress in minutes and its level', () => {
    const { state, id } = towerWithWorker();
    state.people.stress[0] = 20 * STEPS_PER_MINUTE;

    expect(inspectPerson(state, id)).toMatchObject({ stressMinutes: 20, stress: 'stressed' });
    state.people.stress[0] = 40 * STEPS_PER_MINUTE;
    expect(inspectPerson(state, id)).toMatchObject({ stressMinutes: 40, stress: 'veryStressed' });
    state.people.stress[0] = 5 * STEPS_PER_MINUTE;
    expect(inspectPerson(state, id)).toMatchObject({ stressMinutes: 5, stress: 'normal' });
  });

  it.each([
    [TREK_WALKING_TO_DESTINATION, 'walk'],
    [TREK_ON_STAIRS, 'stairs'],
    [TREK_QUEUED, 'wait'],
    [TREK_RIDING, 'ride'],
    [TREK_NO_ROUTE, 'noRoute'],
  ])('reports the trip phase %i as %s', (phase, expected) => {
    const { state, id } = towerWithWorker();
    state.people.trek[0] = phase;

    expect(inspectPerson(state, id)).toMatchObject({ state: expected });
  });

  it('names the unit a trip ends in and the exit when it ends anywhere else', () => {
    const { state, id } = towerWithWorker();
    state.units.u8 = newUnit('u8', 'office', 30, 6);
    setStructure(state.grid, 6, 30, 38, 'floor');
    state.grid.levels[6]?.occupants.push({ x0: 30, x1: 38, occupant: { kind: 'unit', id: 'u8' } });
    state.people.trek[0] = TREK_WALKING_TO_DESTINATION;
    state.people.trekLevel[0] = 6;
    state.people.trekColumn[0] = 33;

    const toUnit = inspectPerson(state, id);

    expect(throughTheWire(toUnit)).toBe(true);
    expect(toUnit).toMatchObject({ destination: { kind: 'unit', unitId: 'u8', level: 6 } });

    state.people.trekLevel[0] = 1;
    state.people.trekColumn[0] = 0;
    expect(inspectPerson(state, id)).toMatchObject({ destination: { kind: 'exit' } });
  });

  it('reports a worker who has not arrived yet as outside', () => {
    const { state, id } = towerWithWorker();
    state.people.trip[0] = 1;

    expect(inspectPerson(state, id)).toMatchObject({ state: 'outside', destination: null });
  });

  it('answers gone for a person who was removed, never existed or has a bad id', () => {
    const { state } = towerWithWorker();
    removePerson(state, 1);

    for (const id of ['p1', 'p99', 'u1', 'p0', 'nonsense']) {
      const data = inspectPerson(state, id);
      expect(data).toEqual({ kind: 'person', id, status: 'gone' });
    }
    expect(throughTheWire(inspectPerson(state, 'p1'))).toBe(true);
  });

  it('answers in under a millisecond in a tower of 15,000 people', () => {
    const state = createTower(3);
    for (let index = 0; index < 15_000; index += 1) {
      addOfficeWorker(state, { homeUnit: 0, level: 2, column: index % 300 });
    }
    renamePerson(state.people, 14_000, 'Ana');
    const started = performance.now();
    for (let run = 0; run < 1000; run += 1) {
      inspectPerson(state, `p${1 + ((run * 15) % 15_000)}`);
    }

    expect((performance.now() - started) / 1000).toBeLessThan(1);
  });
});
