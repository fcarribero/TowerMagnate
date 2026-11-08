import type { TowerState, Unit, UnitId, UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createCondoSystem, sellCondo } from './condos';
import { createCustomers } from './customers';
import { checkIn, createHotelSystem, drawStayNights } from './hotel';
import { createLeaseSystem, moveInTenant, STEPS_PER_WEEK } from './leases';
import { populationOf } from './population';
import { createRng } from './rng';
import { createScheduler } from './scheduler';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';

const SLOT_WIDTH = 32;
const WEDNESDAY = 2;
const THURSDAY = 3;

function at(day: number, hour: number): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR;
}

function towerWithUnits(types: UnitType[]): { state: TowerState; ids: UnitId[] } {
  const units = types.map((type, index) => ({ type, x: index * SLOT_WIDTH, level: 2 }));
  const width = Math.max(1, types.length) * SLOT_WIDTH;
  const { state, unitIds } = buildTower({ ...plainTowerPlan(3, 0, width), units });
  return { state, ids: unitIds as UnitId[] };
}

function unitOf(state: TowerState, id: UnitId | undefined): Unit {
  const unit = id === undefined ? undefined : state.units[id];
  if (!unit) throw new Error(`No unit ${id}`);
  return unit;
}

function lease(state: TowerState, id: UnitId | undefined): void {
  unitOf(state, id).lease = { anchorStep: 0, nextDueStep: STEPS_PER_WEEK };
}

function sell(state: TowerState, id: UnitId | undefined): void {
  unitOf(state, id).sale = {
    price: 150_000,
    anchorStep: 0,
    nextEvaluationStep: 4 * STEPS_PER_WEEK,
  };
}

function occupy(state: TowerState, id: UnitId | undefined): void {
  unitOf(state, id).hotel = {
    state: 'occupied',
    stayEndStep: at(THURSDAY, 10),
    checkInStep: null,
    paidLevel: null,
    arrivalStep: null,
    rollDue: false,
  };
}

function setPreviousDayCount(state: TowerState, id: UnitId | undefined, count: number): void {
  const venue = unitOf(state, id).venue;
  if (!venue) throw new Error(`No venue counts on ${id}`);
  venue.previousDayCount = count;
}

function demolish(state: TowerState, ids: readonly UnitId[]): void {
  state.units = Object.fromEntries(Object.entries(state.units).filter(([id]) => !ids.includes(id)));
}

function seedDrawingOneNight(): number {
  for (let seed = 0; seed < 1_000; seed++) {
    if (drawStayNights(createRng(seed)) === 1) return seed;
  }
  throw new Error('No seed draws a 1-night stay first');
}

/** Copies `template` under `count` new unit ids, so large towers stay cheap to build. */
function addCopies(state: TowerState, template: Unit, count: number, edit: (unit: Unit) => void) {
  const start = Object.keys(state.units).length + 1_000;
  for (let index = 0; index < count; index++) {
    const unit = structuredClone(template);
    unit.id = `u${start + index}`;
    edit(unit);
    state.units[unit.id] = unit;
  }
}

describe('population from offices', () => {
  it('is 0 for an empty tower', () => {
    expect(populationOf(towerWithUnits([]).state).total).toBe(0);
  });

  it('does not count an office without a tenant', () => {
    expect(populationOf(towerWithUnits(['office']).state).offices).toBe(0);
  });

  it('counts 6 for each office with a tenant and nothing for a shop tenant', () => {
    const { state, ids } = towerWithUnits(['office', 'office', 'retail-shop']);
    for (const id of ids) lease(state, id);
    expect(populationOf(state)).toEqual({ offices: 12, condos: 0, hotel: 0, venues: 0, total: 12 });
  });

  it('changes at the exact step of move-in', () => {
    const { state, ids } = towerWithUnits(['office']);
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        (context) => {
          if (context.state.step === 5) moveInTenant(context, ids[0] as UnitId);
        },
        createLeaseSystem(),
      ],
    });
    expect(populationOf(engine.step(state, [], 4).state).total).toBe(0);
    expect(populationOf(engine.step(state, [], 5).state).total).toBe(6);
  });

  it('drops an office when its unit is demolished', () => {
    const { state, ids } = towerWithUnits(['office', 'office']);
    for (const id of ids) lease(state, id);
    demolish(state, [ids[0] as UnitId]);
    expect(populationOf(state).total).toBe(6);
  });
});

describe('population from condos', () => {
  const saleStep = 1_000;
  const evaluationStep = saleStep + 4 * STEPS_PER_WEEK;

  function condoRun() {
    const { state, ids } = towerWithUnits(['condo', 'condo']);
    const condoId = ids[0] as UnitId;
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        (context) => {
          if (context.state.step === saleStep) sellCondo(context, condoId);
        },
        createCondoSystem(() => 'poor'),
      ],
    });
    return { state, engine };
  }

  it('counts 3 for a sold condo from the sale step and nothing for one for sale', () => {
    const { state, engine } = condoRun();
    expect(populationOf(engine.step(state, [], saleStep - 1).state).condos).toBe(0);
    expect(populationOf(engine.step(state, [], saleStep).state).condos).toBe(3);
  });

  it('drops the condo at the exact step of the buyback', () => {
    const { state, engine } = condoRun();
    expect(populationOf(engine.step(state, [], evaluationStep - 1).state).condos).toBe(3);
    expect(populationOf(engine.step(state, [], evaluationStep).state).condos).toBe(0);
  });
});

describe('population from hotel stays', () => {
  it('counts the party size of each room type: single 1, double 2, suite 2', () => {
    const { state, ids } = towerWithUnits(['single-room', 'double-room', 'suite']);
    for (const id of ids) occupy(state, id);
    expect(populationOf(state).hotel).toBe(5);
  });

  it('does not count clean or dirty rooms', () => {
    const { state } = towerWithUnits(['single-room', 'double-room', 'suite']);
    const [, double] = Object.values(state.units).filter((unit) => unit.hotel);
    if (double?.hotel) double.hotel.state = 'dirty';
    expect(populationOf(state).hotel).toBe(0);
  });

  it('counts a double from its check-in step until 10:00 on the check-out day', () => {
    const { state, ids } = towerWithUnits(['double-room']);
    const roomId = ids[0] as UnitId;
    const checkInStep = at(WEDNESDAY, 15);
    state.rng = createRng(seedDrawingOneNight());
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        (context) => {
          if (context.state.step === checkInStep) checkIn(context, roomId);
        },
        createHotelSystem(),
      ],
    });
    const hotelAt = (step: number) => populationOf(engine.step(state, [], step).state).hotel;

    expect(hotelAt(checkInStep - 1)).toBe(0);
    expect(hotelAt(checkInStep)).toBe(2);
    expect(hotelAt(at(THURSDAY, 10) - 1)).toBe(2);
    expect(hotelAt(at(THURSDAY, 10))).toBe(0);
  });
});

describe('population from venues', () => {
  const planOnly = createEngine({
    commandHandlers: {},
    systems: [createScheduler([createCustomers().planHook])],
  });

  function rollAt(state: TowerState, day: number): TowerState {
    const before = structuredClone(state);
    before.step = at(day, 0) - 1;
    return planOnly.step(before, [], 1).state;
  }

  it('counts the previous-day count of fast foods, restaurants and retail shops only', () => {
    const types: UnitType[] = ['fast-food', 'restaurant', 'retail-shop', 'cinema', 'party-hall'];
    const { state, ids } = towerWithUnits(types);
    ids.forEach((id, index) => setPreviousDayCount(state, id, 10 * (index + 1)));
    expect(populationOf(state).venues).toBe(10 + 20 + 30);
  });

  it('changes at the 00:00 roll to the count of the day that ended', () => {
    const { state, ids } = towerWithUnits(['retail-shop']);
    lease(state, ids[0]);
    setPreviousDayCount(state, ids[0], 7);
    const venue = unitOf(state, ids[0]).venue;
    if (venue) venue.countToday = 25;
    expect(populationOf(state).venues).toBe(7);
    expect(populationOf(rollAt(state, WEDNESDAY)).venues).toBe(25);
  });

  it('keeps a shop without a tenant at its count until the next 00:00, then counts 0', () => {
    const { state, ids } = towerWithUnits(['retail-shop']);
    setPreviousDayCount(state, ids[0], 25);
    expect(populationOf(state).venues).toBe(25);
    expect(populationOf(rollAt(state, WEDNESDAY)).venues).toBe(0);
  });
});

describe('population worked examples', () => {
  it('counts 12 + 3 + 2 + 25 = 42 for the QA tower, and 0 once its units are demolished', () => {
    const types: UnitType[] = ['office', 'office', 'condo', 'double-room', 'retail-shop'];
    const { state, ids } = towerWithUnits(types);
    const [officeA, officeB, condo, room, shop] = ids;
    lease(state, officeA);
    lease(state, officeB);
    sell(state, condo);
    occupy(state, room);
    lease(state, shop);
    setPreviousDayCount(state, shop, 25);

    expect(populationOf(state)).toEqual({
      offices: 12,
      condos: 3,
      hotel: 2,
      venues: 25,
      total: 42,
    });
    demolish(state, ids);
    expect(populationOf(state).total).toBe(0);
  });

  it('matches stars 8.1 for every source but the VIP', () => {
    const types: UnitType[] = [
      'office',
      'condo',
      'single-room',
      'double-room',
      'suite',
      'fast-food',
      'restaurant',
      'retail-shop',
    ];
    const { state, ids } = towerWithUnits(types);
    const templates = ids.map((id) => structuredClone(unitOf(state, id)));
    state.units = {};
    const [office, condo, single, double, suite, fastFood, restaurant, shop] = templates as Unit[];
    const countOf = (perUnit: number) => (unit: Unit) => {
      if (unit.venue) unit.venue.previousDayCount = perUnit;
    };
    addCopies(
      state,
      office as Unit,
      520,
      (unit) => (unit.lease = { anchorStep: 0, nextDueStep: 1 }),
    );
    addCopies(state, condo as Unit, 300, (unit) => {
      unit.sale = { price: 150_000, anchorStep: 0, nextEvaluationStep: 1 };
    });
    const stay = (unit: Unit) =>
      (unit.hotel = {
        state: 'occupied',
        stayEndStep: at(THURSDAY, 10),
        checkInStep: null,
        paidLevel: null,
        arrivalStep: null,
        rollDue: false,
      });
    addCopies(state, single as Unit, 40, stay);
    addCopies(state, double as Unit, 30, stay);
    addCopies(state, suite as Unit, 11, stay);
    addCopies(state, fastFood as Unit, 20, countOf(45));
    addCopies(state, restaurant as Unit, 10, countOf(40));
    addCopies(state, shop as Unit, 30, countOf(25));

    expect(populationOf(state)).toEqual({
      offices: 3_120,
      condos: 900,
      hotel: 122,
      venues: 2_050,
      total: 6_192,
    });
  });
});
