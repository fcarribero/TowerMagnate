import {
  STRESS_WINDOW_STEPS,
  type Level,
  type TowerState,
  type Unit,
  type UnitType,
  priceOfLevel,
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
    condo.price = priceOfLevel('condo', 'low');
    condo.sale = { price: 1, anchorStep: 0, nextEvaluationStep: EVALUATION_STEP };
    return { state, condo };
  }

  it('takes the single room at gap 24 as noise and grades the fair price against the base price', () => {
    const { state, condo } = soldCondo();
    fileTrips(state, condo, 54, 5_940);
    expect(unitBase(state, condo)).toBe(110);
    // 110 steps is a score of 4.57, 5.57 with the noise: 18.4% off the base price, v = 0.82.
    const fair = Math.round(priceOfLevel('condo', 'normal') * (1 - (50 * 2.5729) / 7 / 100));
    expect(storeGrade(state, condo)).toBe('fair');
    expect(condo.evaluation).toBe('fair');
    expect(condo.appraisal).toBeCloseTo(fair, -1);
  });

  it('grades the same whatever the condo sold for', () => {
    const { state, condo } = soldCondo();
    fileTrips(state, condo, 54, 8_100);
    state.stars = 3;
    const grades = [1, priceOfLevel('condo', 'normal'), priceOfLevel('condo', 'high') * 10].map(
      (price) => {
        condo.price = price;
        return storeGrade(state, condo);
      },
    );
    expect(new Set(grades).size).toBe(1);
  });

  it('is poor at 3 stars and fair at 4 with a fair price 0.75 of the base price', () => {
    const { state, condo } = soldCondo();
    // A score near 7.4 takes about 31% off at 3 stars and about 27% off at 4.
    fileTrips(state, condo, 54, 54 * 230);
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
      paidRatio: 1.5,
      stayRate: 3_500,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    };
    room.price = priceOfLevel('double-room', 'low');
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

  // B = 34 is a score of 1.72. At 3 stars the fair price is 3,624 without noise and 3,324 with
  // the office close by (+1 to the score). The stay paid 3,500 a night.
  it('counts the stay up to its end, so B = 34 and the grade is fair with the office at gap 14', () => {
    const { state, room } = stayedRoom(70);
    expect(unitBase(state, room)).toBe(34);
    expect(storeGrade(state, room)).toBe('fair');
    expect(room.appraisal).toBe(3_324);
  });

  it('uses the rate the stay paid, not the price set now', () => {
    const { state, room } = stayedRoom(70);
    room.price = priceOfLevel('double-room', 'minimum');
    expect(storeGrade(state, room)).toBe('fair');
  });

  it('is good with the office at gap 21', () => {
    const { state, room } = stayedRoom(77);
    expect(storeGrade(state, room)).toBe('good');
    expect(room.appraisal).toBe(3_624);
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
    shop.lease = { anchorStep: 0, nextDueStep: EVALUATION_STEP, weekVisits: 0, rent: 10_000 };
    fileTrips(state, shop, 180, 14_580);
    return { state, shop };
  }

  it('is poor at alto, fair at normal and good at minimo with B = 81', () => {
    const { state, shop } = leasedShop();
    expect(unitBase(state, shop)).toBe(81);
    // 81 steps is a score of 3.62: the fair price is 4.5% under the base price, plus 1% for the
    // shop itself as an amenity, 14,482.
    shop.price = priceOfLevel('retail-shop', 'high');
    expect(storeGrade(state, shop)).toBe('poor');
    expect(shop.appraisal).toBe(14_482);
    shop.price = priceOfLevel('retail-shop', 'normal');
    expect(storeGrade(state, shop)).toBe('fair');
    shop.price = priceOfLevel('retail-shop', 'minimum');
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
    office.lease = {
      anchorStep: 0,
      nextDueStep: EVALUATION_STEP + 7 * STEPS_PER_DAY,
      weekVisits: 0,
      rent: 10_000,
    };
    return { state, office };
  }

  it('keeps the last grade when the window has no trips', () => {
    const { state, office } = leasedOffice();
    office.evaluation = 'poor';
    storeDailyGrade(state, office);
    expect(office.evaluation).toBe('poor');
  });

  it('grades a tenant who has no trips yet from the tower score, so it is never unevaluated', () => {
    const { state, office } = leasedOffice();
    expect(office.evaluation).toBeNull();
    storeDailyGrade(state, office);
    expect(office.evaluation).toBe('good');
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
    // 30 steps a trip is a score of 1.54: the fair price is 11,460, so normal is good and high poor.
    fileTrips(state, office, 10, 300);
    state.step = EVALUATION_STEP - 1;
    const engine = createEngine({ commandHandlers: {}, systems: [createDailyGradeSystem()] });
    const first = engine.step(state, [], 1).state;
    expect(first.units[office.id]?.evaluation).toBe('good');

    const raised = first.units[office.id] as Unit;
    raised.price = priceOfLevel('office', 'high');
    const beforeMidnight = engine.step(first, [], STEPS_PER_DAY - 1).state;
    expect(beforeMidnight.units[office.id]?.evaluation).toBe('good');
    const atMidnight = engine.step(beforeMidnight, [], 1).state;
    expect(atMidnight.units[office.id]?.evaluation).toBe('poor');
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

  it('grades an office at its weekly end with B = 0 when it has no trips', () => {
    const { state, units } = towerWith({ type: 'office', level: 3, x: 40 });
    const office = units[0] as Unit;
    const termEnd = WEEK;
    office.lease = { anchorStep: 0, nextDueStep: termEnd, weekVisits: 0, rent: 10_000 };
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
    const termEnd = (office.lease as { anchorStep: number }).anchorStep + WEEK;
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
