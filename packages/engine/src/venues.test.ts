import {
  DAILY_INCOME_BRACKETS,
  VENUE_PAYOUT_HOURS,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createScheduler } from './scheduler';
import { createEngine, step } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { newVenueDay } from './units';
import { recordVenueVisit, rollVenueDay, venuePayoutHooks } from './venues';

type VenueType = keyof typeof VENUE_PAYOUT_HOURS;

const engine = createEngine({
  commandHandlers: {},
  systems: [createScheduler(venuePayoutHooks)],
});

const START_MONEY = 1_000_000;
const STEPS_PER_MINUTE = STEPS_PER_HOUR / 60;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

function towerWith(type: VenueType, placedAtStep = 0): { tower: TowerState; id: UnitId } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 60),
    units: [{ type: type as UnitType, x: 0, level: 2 }],
  });
  state.money = START_MONEY;
  const id = unitIds[0] as UnitId;
  (state.units[id] as { placedAtStep: number }).placedAtStep = placedAtStep;
  return { tower: state, id };
}

function setCounts(tower: TowerState, id: UnitId, visits: number, evening = 0): void {
  const venue = tower.units[id]?.venue;
  if (!venue) throw new Error('not a venue');
  venue.visits = visits;
  venue.eveningShowVisits = evening;
}

/** Runs from a few steps before the payout hour through its first step. */
function runThroughPayout(tower: TowerState, type: VenueType, day = 1): TowerState {
  const state = structuredClone(tower);
  state.step = at(day, VENUE_PAYOUT_HOURS[type].pays) - 5;
  return engine.step(state, [], 6).state;
}

const BOUNDARIES: Record<VenueType, number[]> = {
  'fast-food': [0, 24, 25, 34, 35, 49, 50],
  restaurant: [0, 24, 25, 34, 35, 49, 50],
  'party-hall': [0, 24, 25, 39, 40],
  cinema: [0, 39, 40, 79, 80, 99, 100],
};

const VENUE_TYPES = Object.keys(BOUNDARIES) as VenueType[];

function expectedAmount(type: VenueType, customers: number): number {
  const reached = DAILY_INCOME_BRACKETS[type].filter(
    (bracket) => customers >= bracket.minCustomers,
  );
  return (reached.at(-1) as { amount: number }).amount;
}

describe('venue daily income', () => {
  for (const type of VENUE_TYPES) {
    it.each(BOUNDARIES[type])(`pays a ${type} with %i customers by the table`, (customers) => {
      const { tower, id } = towerWith(type);
      // A cinema's customers are the average of two shows, so both shows get the same audience.
      setCounts(tower, id, customers, type === 'cinema' ? customers : 0);
      const after = runThroughPayout(tower, type);
      const amount = expectedAmount(type, customers);
      expect(after.money).toBe(START_MONEY + amount);
      expect(after.ledger.currentWeek.venues.income).toBe(Math.max(amount, 0));
      expect(after.ledger.currentWeek.venues.expense).toBe(Math.min(amount, 0));
    });
  }

  it.each([
    ['fast-food', 'news.fastFoodLoss', 24, true],
    ['fast-food', 'news.fastFoodLoss', 25, false],
    ['restaurant', 'news.restaurantLoss', 24, true],
    ['restaurant', 'news.restaurantLoss', 25, false],
  ] as const)('%s with %i visits reports a loss notice: %s', (type, key, visits, reported) => {
    const { tower, id } = towerWith(type);
    setCounts(tower, id, visits);
    const state = structuredClone(tower);
    state.step = at(1, VENUE_PAYOUT_HOURS[type].pays) - 5;
    const { events } = engine.step(state, [], 6);
    const news = events.filter((event) => event.type === 'news');
    expect(news.map((event) => ({ key: event.key, unitId: event.unitId }))).toEqual(
      reported ? [{ key, unitId: id }] : [],
    );
  });

  it('reports no notice for a venue that was not open that day', () => {
    const late = towerWith('fast-food', at(1, 8, 1));
    const state = structuredClone(late.tower);
    state.step = at(1, 20) - 5;
    expect(engine.step(state, [], 6).events).toEqual([]);
  });

  it.each([
    ['cinema', 'news.cinemaLowAudience', 0, 79, true],
    ['cinema', 'news.cinemaLowAudience', 40, 40, false],
    ['cinema', 'news.cinemaLowAudience', 40, 39, true],
    ['party-hall', 'news.partyHallEmpty', 24, 0, true],
    ['party-hall', 'news.partyHallEmpty', 25, 0, false],
  ] as const)(
    '%s with %i and %i visits reports its notice: %s',
    (type, key, visits, evening, reported) => {
      const { tower, id } = towerWith(type);
      setCounts(tower, id, visits, evening);
      const state = structuredClone(tower);
      state.step = at(1, VENUE_PAYOUT_HOURS[type].pays) - 5;
      const { events } = engine.step(state, [], 6);
      const news = events.filter((event) => event.type === 'news');
      expect(news.map((event) => ({ key: event.key, unitId: event.unitId }))).toEqual(
        reported ? [{ key, unitId: id }] : [],
      );
    },
  );

  it('reports no cinema notice once the film is 56 days old', () => {
    const { tower, id } = towerWith('cinema');
    const venue = tower.units[id]?.venue;
    if (!venue) throw new Error('not a venue');
    venue.filmChangedAtStep = at(1, 0) - 56 * STEPS_PER_DAY;
    const state = structuredClone(tower);
    state.step = at(1, VENUE_PAYOUT_HOURS.cinema.pays) - 5;
    expect(engine.step(state, [], 6).events.filter((event) => event.type === 'news')).toEqual([]);
  });

  it('averages the two cinema shows and rounds down', () => {
    const { tower, id } = towerWith('cinema');
    setCounts(tower, id, 80, 79);
    expect(runThroughPayout(tower, 'cinema').money).toBe(START_MONEY + 2_000);
    setCounts(tower, id, 100, 99);
    expect(runThroughPayout(tower, 'cinema').money).toBe(START_MONEY + 10_000);
  });

  it.each(VENUE_TYPES)('pays %s once, at the first step of its payout hour', (type) => {
    const { tower, id } = towerWith(type);
    setCounts(tower, id, 100, 100);
    const payStep = at(1, VENUE_PAYOUT_HOURS[type].pays);
    const before = structuredClone(tower);
    before.step = payStep - 2;
    const early = engine.step(before, [], 1).state;
    expect(early.step).toBe(payStep - 1);
    expect(early.money).toBe(START_MONEY);
    const onTime = engine.step(early, [], 1).state;
    expect(onTime.step).toBe(payStep);
    expect(onTime.money).not.toBe(START_MONEY);
    expect(engine.step(onTime, [], STEPS_PER_HOUR).state.money).toBe(onTime.money);
  });

  it('gives no payout the day a fast food is placed after it opened', () => {
    const { tower, id } = towerWith('fast-food', at(1, 8, 1));
    const after = runThroughPayout(tower, 'fast-food');
    expect(after.money).toBe(START_MONEY);
    expect(after.units[id]?.venue?.yesterday).toEqual({ visits: 0, result: null });
  });

  it('charges a fast food placed exactly at opening time', () => {
    const { tower } = towerWith('fast-food', at(1, 8));
    expect(runThroughPayout(tower, 'fast-food').money).toBe(START_MONEY - 3_000);
  });

  it('gives no payout the day a cinema is placed after the 14:00 show starts', () => {
    const { tower, id } = towerWith('cinema', at(1, 14, 1));
    setCounts(tower, id, 200, 200);
    expect(runThroughPayout(tower, 'cinema').money).toBe(START_MONEY);
  });

  it('pays on the next day after a late placement', () => {
    const { tower } = towerWith('fast-food', at(1, 8, 1));
    expect(runThroughPayout(tower, 'fast-food', 2).money).toBe(START_MONEY - 3_000);
  });

  it('lets a restaurant loss take the balance below zero', () => {
    const { tower } = towerWith('restaurant');
    tower.money = 2_000;
    expect(runThroughPayout(tower, 'restaurant').money).toBe(-4_000);
  });

  it('pays one entry per venue of the type', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 60),
      units: [
        { type: 'fast-food', x: 0, level: 2 },
        { type: 'fast-food', x: 20, level: 2 },
      ],
    });
    state.money = START_MONEY;
    setCounts(state, unitIds[0] as UnitId, 50);
    const after = runThroughPayout(state, 'fast-food');
    expect(after.money).toBe(START_MONEY + 5_000 - 3_000);
  });

  it('keeps yesterday and starts a new count after the payout', () => {
    const { tower, id } = towerWith('party-hall');
    setCounts(tower, id, 30);
    const after = runThroughPayout(tower, 'party-hall');
    expect(after.units[id]?.venue).toMatchObject({
      visits: 0,
      eveningShowVisits: 0,
      yesterday: { visits: 30, result: 5_000 },
    });
  });
});

describe('recording visits', () => {
  function visit(tower: TowerState, id: UnitId, hour: number, minute = 0): boolean {
    tower.step = at(1, hour, minute);
    return recordVenueVisit(tower, id);
  }

  it('counts visits that start between opening and payout', () => {
    const { tower, id } = towerWith('fast-food');
    expect(visit(tower, id, 7, 59)).toBe(false);
    expect(visit(tower, id, 8)).toBe(true);
    expect(visit(tower, id, 19, 59)).toBe(true);
    expect(visit(tower, id, 20)).toBe(false);
    expect(tower.units[id]?.venue?.visits).toBe(2);
  });

  it('counts a cinema entry only during the two show windows', () => {
    const { tower, id } = towerWith('cinema');
    expect(visit(tower, id, 13, 59)).toBe(false);
    expect(visit(tower, id, 14)).toBe(true);
    expect(visit(tower, id, 15, 59)).toBe(true);
    expect(visit(tower, id, 17)).toBe(false);
    expect(visit(tower, id, 19)).toBe(true);
    expect(visit(tower, id, 21)).toBe(false);
    expect(tower.units[id]?.venue).toMatchObject({ visits: 2, eveningShowVisits: 1 });
  });

  it('counts retail shop visits from 10:00 to 20:00 only while the shop has a tenant', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 60),
      units: [{ type: 'retail-shop', x: 0, level: 2 }],
    });
    const id = unitIds[0] as UnitId;
    expect(visit(state, id, 12)).toBe(false);
    (state.units[id] as { lease: unknown }).lease = { anchorStep: 0, nextDueStep: at(8, 0) };
    expect(visit(state, id, 9, 59)).toBe(false);
    expect(visit(state, id, 10)).toBe(true);
    expect(visit(state, id, 19, 59)).toBe(true);
    expect(visit(state, id, 20)).toBe(false);
    expect(state.units[id]?.venue).toMatchObject({ visits: 0, countToday: 2 });
    expect(state.units[id]?.used).toBe(true);
  });

  it('adds the trip stress of counted visits that were walked', () => {
    const { tower, id } = towerWith('restaurant');
    tower.step = at(1, 18);
    expect(recordVenueVisit(tower, id, 120)).toBe(true);
    expect(recordVenueVisit(tower, id, 30)).toBe(true);
    expect(recordVenueVisit(tower, id)).toBe(true);
    tower.step = at(1, 23);
    expect(recordVenueVisit(tower, id, 500)).toBe(false);
    expect(tower.units[id]?.venue).toMatchObject({
      visits: 3,
      countToday: 3,
      stressSum: 150,
      stressTrips: 2,
    });
  });

  it('rolls the day over into the previous-day count with the average stress', () => {
    const venue = { ...newVenueDay(), countToday: 9, stressSum: 301, stressTrips: 3 };
    expect(rollVenueDay(venue)).toBe(100);
    expect(venue).toMatchObject({ countToday: 0, previousDayCount: 9, stressSum: 0 });
    expect(rollVenueDay(venue)).toBeNull();
    expect(venue.previousDayCount).toBe(0);
  });

  it('refuses a unit that is not a venue', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 60),
      units: [{ type: 'office', x: 0, level: 2 }],
    });
    expect(() => recordVenueVisit(state, unitIds[0] as UnitId)).toThrow('not a food');
  });
});

describe('a scenario day with one venue of each type', () => {
  it('pays each venue its table amount at its payout step', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(10, 0, 120),
      units: VENUE_TYPES.map((type, index) => ({
        type: type as UnitType,
        x: 0,
        level: index * 2 + 2,
      })),
    });
    state.money = START_MONEY;
    const counts: Record<VenueType, [number, number]> = {
      'fast-food': [40, 0],
      restaurant: [10, 0],
      'party-hall': [45, 0],
      cinema: [90, 70],
    };
    VENUE_TYPES.forEach((type, index) =>
      setCounts(state, unitIds[index] as UnitId, ...counts[type]),
    );
    state.step = at(1, 0);

    const payments: { step: number; amount: number }[] = [];
    let tower = state;
    while (tower.step < at(2, 0)) {
      const next = step(tower, [], 1).state;
      if (next.money !== tower.money)
        payments.push({ step: next.step, amount: next.money - tower.money });
      tower = next;
    }

    expect(payments).toEqual([
      { step: at(1, 17), amount: 10_000 },
      { step: at(1, 20), amount: 3_000 },
      { step: at(1, 21), amount: 10_000 },
      { step: at(1, 23), amount: -6_000 },
    ]);
    expect(tower.ledger.currentWeek.venues.income).toBe(23_000);
  });
  it('reports each venue day result as unit money, negative for a loss', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(10, 0, 120),
      units: VENUE_TYPES.map((type, index) => ({
        type: type as UnitType,
        x: 0,
        level: index * 2 + 2,
      })),
    });
    state.money = START_MONEY;
    const counts: Record<VenueType, [number, number]> = {
      'fast-food': [40, 0],
      restaurant: [10, 0],
      'party-hall': [45, 0],
      cinema: [90, 70],
    };
    VENUE_TYPES.forEach((type, index) =>
      setCounts(state, unitIds[index] as UnitId, ...counts[type]),
    );
    state.step = at(1, 0);
    const run = step(state, [], at(2, 0) - at(1, 0));
    const money = run.events.flatMap((event) =>
      event.type === 'unitMoney' ? [{ unitId: event.unitId, amount: event.amount }] : [],
    );
    expect(money).toHaveLength(4);
    expect(money.map((item) => item.amount).sort((a, b) => a - b)).toEqual([
      -6_000, 3_000, 10_000, 10_000,
    ]);
    expect(new Set(money.map((item) => item.unitId))).toEqual(new Set(unitIds));
  });
});
