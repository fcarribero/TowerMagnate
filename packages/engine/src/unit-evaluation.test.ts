import {
  LEASE_CONTRACT_WEEKS,
  STRESS_WINDOW_STEPS,
  type Level,
  type TowerState,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createCondoSystem, sellCondo } from './condos';
import { createLeaseSystem, moveInTenant } from './leases';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { addPerson } from './people';
import { recordTrip } from './trip-ledger';
import {
  clearUnitLedger,
  createDailyGradeSystem,
  fileShopVisit,
  fileUnitTrip,
  storeDailyGrade,
  storeGrade,
  unitBase,
} from './unit-evaluation';

const STEPS_PER_MINUTE = STEPS_PER_HOUR / 60;
const EVALUATION_STEP = 10 * STEPS_PER_DAY;

interface Placement {
  type: UnitType;
  level: Level;
  x: number;
}

function towerWith(...placements: Placement[]): { state: TowerState; units: Unit[] } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(20, 0, 299),
    units: placements,
  });
  state.step = EVALUATION_STEP;
  const units = unitIds.map((id) => state.units[id] as Unit);
  return { state, units };
}

/** Files `count` trips of equal stress that ended inside the week before the evaluation step. */
function fileTrips(state: TowerState, unit: Unit, count: number, total: number): void {
  for (let index = 0; index < count; index++) {
    const endStep = EVALUATION_STEP - 1 - index * 100;
    fileUnitTrip(state, unit, endStep, total / count);
  }
}

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

describe('condo evaluation (10.4)', () => {
  function soldCondo() {
    const { state, units } = towerWith(
      { type: 'condo', level: 20, x: 200 },
      { type: 'single-room', level: 20, x: 240 },
    );
    const condo = units[0] as Unit;
    condo.priceLevel = 'low';
    condo.sale = { price: 1, anchorStep: 0, nextEvaluationStep: EVALUATION_STEP };
    return { state, condo };
  }

  it('is fair with B = 110, bajo and a single room at gap 24', () => {
    const { state, condo } = soldCondo();
    fileTrips(state, condo, 54, 5_940);
    expect(unitBase(state, condo)).toBe(110);
    expect(storeGrade(state, condo)).toBe('fair');
    expect(condo.evaluation).toBe('fair');
  });

  it('is poor at 3 stars and fair at 4 with a score of exactly 180', () => {
    const { state, condo } = soldCondo();
    fileTrips(state, condo, 54, 8_100);
    state.stars = 3;
    expect(storeGrade(state, condo)).toBe('poor');
    state.stars = 4;
    expect(storeGrade(state, condo)).toBe('fair');
  });
});

describe('hotel room evaluation (10.5)', () => {
  const MONDAY = 8;
  const WEDNESDAY = 10;

  function stayedRoom(officeX: number) {
    const { state, units } = towerWith(
      { type: 'double-room', level: 16, x: 50 },
      { type: 'office', level: 16, x: officeX },
    );
    const room = units[0] as Unit;
    room.hotel = {
      state: 'occupied',
      stayEndStep: at(WEDNESDAY, 10),
      checkInStep: at(MONDAY, 17),
      paidLevel: 'high',
      arrivalStep: null,
      rollDue: false,
    };
    room.priceLevel = 'low';
    const trips: [number, number][] = [
      [at(MONDAY, 18, 40), 40],
      [at(MONDAY, 20, 5), 30],
      [at(MONDAY, 21, 12), 26],
      [at(MONDAY, 18, 40), 40],
      [at(WEDNESDAY, 9, 20), 34],
      [at(WEDNESDAY, 10, 3), 50],
    ];
    for (const [endStep, stress] of trips) fileUnitTrip(state, room, endStep, stress);
    state.step = at(WEDNESDAY, 10);
    state.stars = 3;
    return { state, room };
  }

  it('counts the stay up to its end, so B = 34 and the grade is fair with the office at gap 14', () => {
    const { state, room } = stayedRoom(70);
    expect(unitBase(state, room)).toBe(34);
    expect(storeGrade(state, room)).toBe('fair');
  });

  it('uses the level paid at check-in, not the level set now', () => {
    const { state, room } = stayedRoom(70);
    room.priceLevel = 'minimum';
    expect(storeGrade(state, room)).toBe('fair');
  });

  it('is good with the office at gap 21', () => {
    const { state, room } = stayedRoom(77);
    expect(storeGrade(state, room)).toBe('good');
  });

  it('has no base before the first stay', () => {
    const { state, units } = towerWith({ type: 'suite', level: 5, x: 50 });
    expect(unitBase(state, units[0] as Unit)).toBe(0);
  });
});

describe('retail shop evaluation (10.6)', () => {
  function leasedShop() {
    const { state, units } = towerWith({ type: 'retail-shop', level: 3, x: 40 });
    const shop = units[0] as Unit;
    shop.lease = { anchorStep: 0, nextDueStep: EVALUATION_STEP };
    fileTrips(state, shop, 180, 14_580);
    return { state, shop };
  }

  it('is fair at alto and good at normal and minimo with B = 81', () => {
    const { state, shop } = leasedShop();
    expect(unitBase(state, shop)).toBe(81);
    shop.priceLevel = 'high';
    expect(storeGrade(state, shop)).toBe('fair');
    shop.priceLevel = 'normal';
    expect(storeGrade(state, shop)).toBe('good');
    shop.priceLevel = 'minimum';
    expect(storeGrade(state, shop)).toBe('good');
  });
});

describe('window of offices, shops and condos', () => {
  it('counts a trip ended 60,480 steps before the step and not one ended at the step', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    fileUnitTrip(state, office, EVALUATION_STEP - STRESS_WINDOW_STEPS - 1, 500);
    fileUnitTrip(state, office, EVALUATION_STEP - STRESS_WINDOW_STEPS, 100);
    fileUnitTrip(state, office, EVALUATION_STEP, 900);
    expect(unitBase(state, office)).toBe(100);
  });

  it('drops trips that left every window when a new one is filed', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    fileUnitTrip(state, office, 10, 50);
    fileUnitTrip(state, office, 10 + STRESS_WINDOW_STEPS + 1, 70);
    expect(state.unitLedger[office.id]).toEqual([10 + STRESS_WINDOW_STEPS + 1, 70]);
  });

  it('gives B = 0 with no trips', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    expect(unitBase(state, units[0] as Unit)).toBe(0);
  });

  it('starts over when the ledger is cleared', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    fileTrips(state, office, 3, 300);
    clearUnitLedger(state, office.id);
    expect(unitBase(state, office)).toBe(0);
    expect(state.unitLedger).toEqual({});
  });
});

describe('daily grade at 00:00', () => {
  function leasedOffice() {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    office.lease = { anchorStep: 0, nextDueStep: EVALUATION_STEP + 7 * STEPS_PER_DAY };
    return { state, office };
  }

  it('keeps the last grade when the window has no trips', () => {
    const { state, office } = leasedOffice();
    office.evaluation = 'poor';
    storeDailyGrade(state, office);
    expect(office.evaluation).toBe('poor');
  });

  it('clears the grade of a unit with no tenant', () => {
    const { state, office } = leasedOffice();
    office.lease = null;
    office.evaluation = 'fair';
    storeDailyGrade(state, office);
    expect(office.evaluation).toBeNull();
  });

  it('shows a price change at the next 00:00', () => {
    const { state, office } = leasedOffice();
    fileTrips(state, office, 10, 800);
    state.step = EVALUATION_STEP - 1;
    const engine = createEngine({ commandHandlers: {}, systems: [createDailyGradeSystem()] });
    const first = engine.step(state, [], 1).state;
    expect(first.units[office.id]?.evaluation).toBe('good');

    const raised = first.units[office.id] as Unit;
    raised.priceLevel = 'high';
    const beforeMidnight = engine.step(first, [], STEPS_PER_DAY - 1).state;
    expect(beforeMidnight.units[office.id]?.evaluation).toBe('good');
    const atMidnight = engine.step(beforeMidnight, [], 1).state;
    expect(atMidnight.units[office.id]?.evaluation).toBe('fair');
  });

  it('leaves hotel rooms to their stay end', () => {
    const { state, units } = towerWith({ type: 'suite', level: 5, x: 40 });
    const suite = units[0] as Unit;
    suite.evaluation = 'poor';
    storeDailyGrade(state, suite);
    expect(suite.evaluation).toBe('poor');
  });
});

describe('filing trips', () => {
  it('files a finished trip of an office worker in the office ledger', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    const homeUnit = Number(office.id.slice(1));
    addPerson(state, { kind: 'officeWorker', homeUnit, level: 3, column: 41 });
    state.people.tripSum[0] = 75;
    recordTrip(state, 0);
    expect(state.unitLedger[office.id]).toEqual([EVALUATION_STEP, 75]);
  });

  function residentAtShop() {
    const { state, units } = towerWith(
      { type: 'condo', level: 3, x: 0 },
      { type: 'retail-shop', level: 3, x: 40 },
      { type: 'fast-food', level: 3, x: 80 },
    );
    const [condo, shop, fastFood] = units as [Unit, Unit, Unit];
    addPerson(state, {
      kind: 'resident',
      homeUnit: Number(condo.id.slice(1)),
      level: 3,
      column: 41,
    });
    return { state, condo, shop, fastFood, personId: state.people.id[0] as number };
  }

  it('files the trip a resident ended at a shop door in the shop ledger', () => {
    const { state, shop, personId } = residentAtShop();
    state.people.tripSum[0] = 60;
    recordTrip(state, 0);
    fileShopVisit(state, shop, personId);
    expect(state.unitLedger[shop.id]).toEqual([EVALUATION_STEP, 60]);
  });

  it('files nothing for a visit with no trip ended at this step', () => {
    const { state, shop, personId } = residentAtShop();
    state.people.tripSum[0] = 60;
    recordTrip(state, 0);
    state.step += 1;
    fileShopVisit(state, shop, personId);
    expect(state.unitLedger[shop.id]).toBeUndefined();
  });

  it('files nothing at a venue that is not a shop', () => {
    const { state, fastFood, personId } = residentAtShop();
    state.people.tripSum[0] = 60;
    recordTrip(state, 0);
    fileShopVisit(state, fastFood, personId);
    expect(state.unitLedger[fastFood.id]).toBeUndefined();
  });
});

describe('grades at lease end, condo evaluation and stay end', () => {
  const WEEK = 7 * STEPS_PER_DAY;

  it('grades an office at its lease end with B = 0 when it has no trips', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    const termEnd = LEASE_CONTRACT_WEEKS * WEEK;
    office.lease = { anchorStep: 0, nextDueStep: termEnd };
    state.step = termEnd - 1;
    const engine = createEngine({ commandHandlers: {}, systems: [createLeaseSystem()] });
    const after = engine.step(state, [], 1).state;
    expect(after.units[office.id]?.evaluation).toBe('good');
  });

  it('clears the ledger when a new tenant moves in and the grade when the tenant leaves', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    fileTrips(state, office, 2, 200);
    moveInTenant({ state, events: [] }, office.id);
    expect(state.unitLedger[office.id]).toBeUndefined();

    office.evaluation = 'good';
    const termEnd =
      (office.lease as { anchorStep: number }).anchorStep + LEASE_CONTRACT_WEEKS * WEEK;
    fileUnitTrip(state, office, termEnd - 10, 2_000);
    (office.lease as { nextDueStep: number }).nextDueStep = termEnd;
    state.step = termEnd - 1;
    const engine = createEngine({
      commandHandlers: {},
      systems: [createLeaseSystem((_state, unit) => unit.evaluation)],
    });
    const after = engine.step(state, [], 1).state;
    expect(after.units[office.id]?.lease).toBeNull();
    expect(after.units[office.id]?.evaluation).toBeNull();
  });

  it('grades a condo at its evaluation step and clears the ledger on a sale', () => {
    const { state, units } = towerWith({ type: 'condo', level: 5, x: 40 });
    const condo = units[0] as Unit;
    fileTrips(state, condo, 2, 2_000);
    sellCondo({ state, events: [] }, condo.id);
    expect(state.unitLedger[condo.id]).toBeUndefined();

    const evaluationStep = (condo.sale as { nextEvaluationStep: number }).nextEvaluationStep;
    fileUnitTrip(state, condo, evaluationStep - 10, 100);
    state.step = evaluationStep - 1;
    const engine = createEngine({ commandHandlers: {}, systems: [createCondoSystem()] });
    const after = engine.step(state, [], 1).state;
    expect(after.units[condo.id]?.evaluation).toBe('fair');
  });
});
