import { beforeAll, describe, expect, it } from 'vitest';
import {
  LEDGER_CATEGORIES,
  type Command,
  type LedgerCategory,
  type PriceLevel,
  type TowerState,
  type UnitId,
  type WeekTotals,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { idleCar } from '../commands/shafts';
import { hashState } from '../hash';
import {
  buildTower,
  createEconomyEngine,
  firstLedgerMismatch,
  runEconomyScenario,
  type DayCommand,
  type EconomyRun,
  type EconomyScript,
  type ExpectedDay,
  type TimedEconomyAction,
} from '../testing';

const WEEK_STEPS = 60_480;
const DAYS = 14;
const X = 100;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

const UNIT_NAMES = [
  'officeA',
  'officeB',
  'shop',
  'fastFood',
  'restaurant',
  'condoA',
  'condoB',
  'single',
  'double',
  'suite',
  'partyHall',
  'cinema',
] as const;

type EconomyUnits = Record<(typeof UNIT_NAMES)[number], UnitId>;

function named(unitIds: readonly UnitId[]): EconomyUnits {
  const units = {} as EconomyUnits;
  for (const [index, name] of UNIT_NAMES.entries()) {
    const id = unitIds[index];
    if (id === undefined) throw new Error(`No unit placed for ${name}`);
    units[name] = id;
  }
  return units;
}

/**
 * Lobby on 80 columns, three floors of units, two-floor party hall and cinema on top, and one
 * standard shaft with 3 cars. Upkeep at 3 stars: rooms 2,000 + 3,000 + 6,000, party hall 20,000,
 * cars 3 x 20,000, lobby 80 x 500 = 131,000 a week.
 */
function economyTower(): { tower: TowerState; units: EconomyUnits } {
  const { state, unitIds, shaftIds } = buildTower({
    seed: 1,
    lobby: { x0: X, x1: X + 79 },
    floors: [{ from: 2, to: 5, x0: X, x1: X + 79 }],
    units: [
      { type: 'office', level: 2, x: X + 10 },
      { type: 'office', level: 2, x: X + 19 },
      { type: 'retail-shop', level: 2, x: X + 28 },
      { type: 'fast-food', level: 2, x: X + 40 },
      { type: 'restaurant', level: 2, x: X + 56 },
      { type: 'condo', level: 3, x: X + 10 },
      { type: 'condo', level: 3, x: X + 26 },
      { type: 'single-room', level: 3, x: X + 42 },
      { type: 'double-room', level: 3, x: X + 46 },
      { type: 'suite', level: 3, x: X + 52 },
      { type: 'party-hall', level: 4, x: X + 10 },
      { type: 'cinema', level: 4, x: X + 34 },
    ],
    shafts: [{ type: 'standard', x: X, bottom: 1, top: 5 }],
  });
  const shaft = state.shafts[shaftIds[0] ?? ''];
  if (!shaft) throw new Error('The plan has no shaft');
  shaft.cars.push(idleCar(1, 0, 0), idleCar(1, 0, 0));
  state.stars = 3;
  return { tower: state, units: named(unitIds) };
}

/** Seed 1 draws these stay lengths, in the order of the successful check-ins below. */
const SEED_ONE_NIGHTS = [2, 2, 3, 4, 1, 1, 2, 2, 2, 1, 1, 1];

interface VenueVisits {
  fastFood: number;
  restaurant: number;
  partyHall: number;
  matinee: number;
  evening: number;
}

/** Counted visits per day; the brackets they hit are summed into the venues column below. */
const VENUE_VISITS: readonly VenueVisits[] = [
  { fastFood: 20, restaurant: 50, partyHall: 40, matinee: 120, evening: 120 },
  { fastFood: 25, restaurant: 10, partyHall: 24, matinee: 100, evening: 99 },
  { fastFood: 34, restaurant: 35, partyHall: 25, matinee: 80, evening: 81 },
  { fastFood: 35, restaurant: 25, partyHall: 39, matinee: 79, evening: 80 },
  { fastFood: 49, restaurant: 0, partyHall: 50, matinee: 40, evening: 41 },
  { fastFood: 50, restaurant: 60, partyHall: 0, matinee: 39, evening: 40 },
  { fastFood: 60, restaurant: 34, partyHall: 45, matinee: 0, evening: 0 },
  { fastFood: 0, restaurant: 49, partyHall: 30, matinee: 120, evening: 80 },
  { fastFood: 24, restaurant: 24, partyHall: 40, matinee: 60, evening: 60 },
  { fastFood: 30, restaurant: 50, partyHall: 10, matinee: 100, evening: 101 },
  { fastFood: 40, restaurant: 35, partyHall: 25, matinee: 10, evening: 120 },
  { fastFood: 55, restaurant: 25, partyHall: 40, matinee: 90, evening: 90 },
  { fastFood: 10, restaurant: 12, partyHall: 39, matinee: 119, evening: 80 },
  { fastFood: 50, restaurant: 70, partyHall: 50, matinee: 120, evening: 120 },
];

function setPrice(day: number, unitId: UnitId, price: PriceLevel): DayCommand {
  const command: Command = { type: 'setPrice', unitId, price };
  return { day, command };
}

function economyScript(units: EconomyUnits): EconomyScript {
  const act = (step: number, action: TimedEconomyAction['action']) => ({ step, action });
  const moveIn = (step: number, unitId: UnitId) => act(step, { kind: 'moveIn', unitId });
  const sell = (step: number, unitId: UnitId) => act(step, { kind: 'sellCondo', unitId });
  const checkIn = (step: number, unitId: UnitId) => act(step, { kind: 'checkIn', unitId });
  const visits = (step: number, unitId: UnitId, count: number) =>
    act(step, { kind: 'visits', unitId, count });

  const actions: TimedEconomyAction[] = [
    moveIn(at(0, 9), units.officeA),
    moveIn(at(2, 14, 30), units.officeB),
    moveIn(at(6, 23, 59), units.shop),
    sell(at(1, 10), units.condoA),
    sell(at(10, 18), units.condoB),

    checkIn(at(0, 12), units.single),
    checkIn(at(0, 15), units.double),
    checkIn(at(0, 23), units.suite),
    checkIn(at(1, 14), units.single),
    checkIn(at(2, 12), units.single),
    checkIn(at(3, 11, 59), units.double),
    checkIn(at(3, 13), units.double),
    checkIn(at(4, 20), units.suite),
    checkIn(at(5, 18), units.double),
    checkIn(at(6, 12), units.single),
    checkIn(at(6, 23, 1), units.suite),
    checkIn(at(7, 12, 30), units.suite),
    checkIn(at(8, 16), units.double),
    checkIn(at(9, 12), units.single),
    checkIn(at(11, 22), units.suite),

    visits(at(3, 7), units.fastFood, 5),
    visits(at(3, 20, 30), units.fastFood, 5),
    visits(at(1, 16), units.restaurant, 30),
    visits(at(0, 17), units.cinema, 10),
  ];
  for (const [day, counts] of VENUE_VISITS.entries()) {
    actions.push(visits(at(day, 12), units.fastFood, counts.fastFood));
    actions.push(visits(at(day, 19), units.restaurant, counts.restaurant));
    actions.push(visits(at(day, 14), units.partyHall, counts.partyHall));
    actions.push(visits(at(day, 14, 30), units.cinema, counts.matinee));
    actions.push(visits(at(day, 19, 30), units.cinema, counts.evening));
  }

  const commands = [
    setPrice(0, units.officeB, 'high'),
    setPrice(3, units.condoB, 'high'),
    setPrice(4, units.condoA, 'high'),
    setPrice(5, units.single, 'high'),
    setPrice(8, units.officeB, 'low'),
    setPrice(10, units.suite, 'low'),
  ];
  return { actions, commands };
}

/**
 * Hand-computed from docs/design/economy.md. Each row ends at 00:00 of the next day, so the
 * Monday upkeep of 131,000 lands on the Sunday rows.
 *
 * Rent: office A 10,000 on days 0 and 7; office B 15,000 (alto) on day 2 and 5,000 (bajo) on
 * day 9; shop 15,000 on days 6 and 13 at 23:59.
 * Condos: A 150,000 on day 1; B 200,000 (alto) on day 10.
 * Hotel: day 0 single 2 x 2,000, double 2 x 3,000, suite 3 x 6,000 at 23:00; day 1 single
 * refused (occupied); day 2 single 4 x 2,000; day 3 double refused at 11:59, then 1 x 3,000;
 * day 4 suite 1 x 6,000; day 5 double 2 x 3,000; day 6 single 2 x 3,000 (alto), suite refused
 * at 23:01; day 7 suite 2 x 6,000; day 8 double 1 x 3,000; day 9 single 1 x 3,000; day 11 suite
 * 1 x 4,000 (bajo).
 * Venues per day are fast food + restaurant + party hall + cinema brackets for the visit tables.
 */
const EXPECTED_DAYS: ExpectedDay[] = [
  { balance: 2_070_000, changes: { rent: 10_000, hotel: 28_000, venues: 32_000 } },
  { balance: 2_226_000, changes: { condoSales: 150_000, venues: 6_000 } },
  { balance: 2_272_000, changes: { rent: 15_000, hotel: 8_000, venues: 23_000 } },
  { balance: 2_289_000, changes: { hotel: 3_000, venues: 14_000 } },
  { balance: 2_304_000, changes: { hotel: 6_000, venues: 9_000 } },
  { balance: 2_325_000, changes: { hotel: 6_000, venues: 15_000 } },
  {
    balance: 2_234_000,
    changes: { rent: 15_000, hotel: 6_000, venues: 19_000, upkeep: -131_000 },
  },
  { balance: 2_279_000, changes: { rent: 10_000, hotel: 12_000, venues: 23_000 } },
  { balance: 2_285_000, changes: { hotel: 3_000, venues: 3_000 } },
  { balance: 2_320_000, changes: { rent: 5_000, hotel: 3_000, venues: 27_000 } },
  { balance: 2_536_000, changes: { condoSales: 200_000, venues: 16_000 } },
  { balance: 2_569_000, changes: { hotel: 4_000, venues: 29_000 } },
  { balance: 2_575_000, changes: { venues: 6_000 } },
  { balance: 2_499_000, changes: { rent: 15_000, venues: 40_000, upkeep: -131_000 } },
];

type PartialWeek = Partial<Record<LedgerCategory, { income?: number; expense?: number }>>;

function weekTotals(lines: PartialWeek): WeekTotals {
  const totals = {} as WeekTotals;
  for (const category of LEDGER_CATEGORIES) {
    totals[category] = {
      income: lines[category]?.income ?? 0,
      expense: lines[category]?.expense ?? 0,
    };
  }
  return totals;
}

const WEEK_ONE = weekTotals({
  rent: { income: 40_000 },
  hotel: { income: 57_000 },
  condoSales: { income: 150_000 },
  venues: { income: 133_000, expense: -15_000 },
});

const WEEK_TWO = weekTotals({
  rent: { income: 30_000 },
  hotel: { income: 22_000 },
  condoSales: { income: 200_000 },
  venues: { income: 165_000, expense: -21_000 },
  upkeep: { expense: -131_000 },
});

const UPKEEP_ONLY = weekTotals({ upkeep: { expense: -131_000 } });

function runTwoWeeks(): EconomyRun {
  const { tower, units } = economyTower();
  return runEconomyScenario(tower, economyScript(units), DAYS);
}

describe('scenario: economy over two game weeks', () => {
  let run: EconomyRun;

  beforeAll(() => {
    run = runTwoWeeks();
  });

  it('ends 14 days at step 120,960', () => {
    expect(run.state.step).toBe(2 * WEEK_STEPS);
  });

  it('matches the hand-computed balance and categories at the end of every day', () => {
    const mismatch = firstLedgerMismatch(run.days, EXPECTED_DAYS);
    expect(mismatch, mismatch ?? '').toBeNull();
  });

  it('draws the stay lengths the hotel lines assume', () => {
    const nights = run.events.flatMap((event) =>
      event.type === 'hotelCheckIn' ? [event.nights] : [],
    );
    expect(nights).toEqual(SEED_ONE_NIGHTS);
  });

  it('accepts every price change except the sold condo', () => {
    expect(run.results.map((result) => (result.ok ? 'ok' : result.error))).toEqual([
      'ok',
      'ok',
      'PRICE_LOCKED',
      'ok',
      'ok',
      'ok',
    ]);
  });

  it('keeps week two in previous week and only its upkeep in the new week', () => {
    expect(run.state.ledger.previousWeek).toEqual(WEEK_TWO);
    expect(run.state.ledger.currentWeek).toEqual(UPKEEP_ONLY);
  });

  it('gives identical results on a second run', () => {
    const second = runTwoWeeks();
    expect(second.days).toEqual(run.days);
    expect(hashState(second.state)).toBe(hashState(run.state));
  });
});

describe('scenario: economy week boundary at step 60,480', () => {
  it('moves week one to previous week before charging upkeep', () => {
    const { tower, units } = economyTower();
    const script = economyScript(units);
    const firstSixDays = runEconomyScenario(tower, script, 6).state;
    const engine = createEconomyEngine(script.actions);

    const sunday = engine.step(firstSixDays, [], STEPS_PER_DAY - 1).state;
    expect(sunday.step).toBe(WEEK_STEPS - 1);
    expect(sunday.ledger.currentWeek).toEqual(WEEK_ONE);
    expect(sunday.money).toBe(2_365_000);

    const monday = engine.step(sunday, [], 1).state;
    expect(monday.ledger.previousWeek).toEqual(WEEK_ONE);
    expect(monday.ledger.currentWeek).toEqual(UPKEEP_ONLY);
    expect(monday.money).toBe(2_234_000);
  });
});
