import {
  LEDGER_CATEGORIES,
  MONEY_CAP,
  STARTING_MONEY,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { WEEKDAYS } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  chargeMoney,
  constructionFundsError,
  creditMoney,
  emptyWeekTotals,
  ledgerWeekRollHook,
  rollLedgerWeek,
  summarizeWeek,
} from './money';
import { createScheduler, type ScheduledHook } from './scheduler';
import { createTower } from './state';
import { createEngine, runDays } from './step';

const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;

function towerWithMoney(money: number): TowerState {
  const tower = createTower(1);
  tower.money = money;
  return tower;
}

describe('starting balance', () => {
  it('starts at $2,000,000 with every category at zero in both weeks', () => {
    const tower = createTower(1);
    expect(tower.money).toBe(STARTING_MONEY);
    expect(tower.money).toBe(2_000_000);
    expect(tower.ledger.currentWeek).toEqual(emptyWeekTotals());
    expect(tower.ledger.previousWeek).toEqual(emptyWeekTotals());
  });

  it('has a ledger line for every economy spec category', () => {
    expect(Object.keys(emptyWeekTotals())).toEqual([
      'rent',
      'hotel',
      'condoSales',
      'venues',
      'events',
      'construction',
      'upkeep',
      'condoBuybacks',
      'films',
    ]);
  });
});

describe('creditMoney', () => {
  it('adds income and records it under its category', () => {
    const tower = createTower(1);
    expect(creditMoney(tower, 'rent', 10_000)).toBe(10_000);
    expect(tower.money).toBe(2_010_000);
    expect(tower.ledger.currentWeek.rent).toEqual({ income: 10_000, expense: 0 });
  });

  it('clamps income at the cap and records only what was credited', () => {
    const tower = towerWithMoney(MONEY_CAP - 3_000);
    expect(creditMoney(tower, 'condoSales', 150_000)).toBe(3_000);
    expect(tower.money).toBe(99_999_999);
    expect(tower.ledger.currentWeek.condoSales.income).toBe(3_000);
  });

  it('credits and records nothing once the balance sits at the cap', () => {
    const tower = towerWithMoney(MONEY_CAP);
    expect(creditMoney(tower, 'hotel', 500)).toBe(0);
    expect(tower.money).toBe(MONEY_CAP);
    expect(tower.ledger.currentWeek.hotel.income).toBe(0);
  });

  it('credits a refund in full while the balance is negative', () => {
    const tower = towerWithMoney(-50_000);
    creditMoney(tower, 'construction', 20_000);
    expect(tower.money).toBe(-30_000);
  });

  it('rejects negative and fractional amounts without touching the balance', () => {
    const tower = createTower(1);
    expect(() => creditMoney(tower, 'rent', -1)).toThrow(RangeError);
    expect(() => creditMoney(tower, 'rent', 1.5)).toThrow(RangeError);
    expect(tower.money).toBe(STARTING_MONEY);
  });
});

describe('chargeMoney', () => {
  it('records expenses as negative totals', () => {
    const tower = createTower(1);
    chargeMoney(tower, 'construction', 500_000);
    expect(tower.money).toBe(1_500_000);
    expect(tower.ledger.currentWeek.construction).toEqual({ income: 0, expense: -500_000 });
  });

  it('lets upkeep take the balance below zero in full', () => {
    const tower = towerWithMoney(30_000);
    chargeMoney(tower, 'upkeep', 200_000);
    expect(tower.money).toBe(-170_000);
    chargeMoney(tower, 'upkeep', 40_000);
    expect(tower.money).toBe(-210_000);
    expect(tower.ledger.currentWeek.upkeep.expense).toBe(-240_000);
  });

  it('keeps income and expense apart inside a mixed-sign category', () => {
    const tower = createTower(1);
    creditMoney(tower, 'venues', 15_000);
    chargeMoney(tower, 'venues', 4_000);
    expect(tower.ledger.currentWeek.venues).toEqual({ income: 15_000, expense: -4_000 });
  });
});

describe('constructionFundsError', () => {
  it('blocks any construction while the balance is negative', () => {
    expect(constructionFundsError(towerWithMoney(-1), 0)).toBe('NEGATIVE_BALANCE');
  });

  it('rejects a cost above the balance', () => {
    expect(constructionFundsError(towerWithMoney(99_999), 100_000)).toBe('INSUFFICIENT_FUNDS');
  });

  it('allows a cost equal to the balance, and anything at a zero balance that costs nothing', () => {
    expect(constructionFundsError(towerWithMoney(100_000), 100_000)).toBeNull();
    expect(constructionFundsError(towerWithMoney(0), 0)).toBeNull();
  });
});

describe('summarizeWeek', () => {
  it('sums income and expense rows without netting inside a category', () => {
    const tower = createTower(1);
    creditMoney(tower, 'rent', 30_000);
    creditMoney(tower, 'venues', 10_000);
    chargeMoney(tower, 'venues', 2_000);
    chargeMoney(tower, 'upkeep', 20_000);
    expect(summarizeWeek(tower.ledger.currentWeek)).toEqual({
      income: 40_000,
      expense: -22_000,
      result: 18_000,
    });
  });

  it('matches the balance change over the week', () => {
    const tower = createTower(1);
    creditMoney(tower, 'hotel', 9_000);
    chargeMoney(tower, 'films', 300_000);
    creditMoney(tower, 'events', 1_000_000);
    expect(tower.money - STARTING_MONEY).toBe(summarizeWeek(tower.ledger.currentWeek).result);
  });
});

describe('rollLedgerWeek', () => {
  it('moves this week to the previous week, drops the old one and starts at zero', () => {
    const tower = createTower(1);
    creditMoney(tower, 'rent', 1_000);
    rollLedgerWeek(tower);
    creditMoney(tower, 'rent', 2_000);
    rollLedgerWeek(tower);
    expect(tower.ledger.previousWeek.rent.income).toBe(2_000);
    expect(tower.ledger.currentWeek).toEqual(emptyWeekTotals());
  });

  it('does not change the balance', () => {
    const tower = createTower(1);
    chargeMoney(tower, 'construction', 70_000);
    rollLedgerWeek(tower);
    expect(tower.money).toBe(1_930_000);
  });
});

/** Pays $5,000 of rent every day at 09:00, so each full week earns $35,000. */
const dailyRent: ScheduledHook = {
  name: 'test-daily-rent',
  schedule: { every: 'day', hour: 9, minute: 0 },
  run(context) {
    creditMoney(context.state, 'rent', 5_000);
  },
};

/** Charges $20,000 of upkeep every Monday at 00:00, after the roll. */
const weeklyUpkeep: ScheduledHook = {
  name: 'test-weekly-upkeep',
  schedule: { every: 'week', weekday: WEEKDAYS.monday, hour: 0, minute: 0 },
  run(context) {
    chargeMoney(context.state, 'upkeep', 20_000);
  },
};

const moneyEngine = createEngine({
  commandHandlers: {},
  systems: [createScheduler([ledgerWeekRollHook, dailyRent, weeklyUpkeep])],
});

describe('weekly roll over a running tower', () => {
  it('after 8 days the previous week holds days 0 to 6 and this week holds Monday', () => {
    const { state } = moneyEngine.runDays(createTower(1), 8);
    expect(state.ledger.previousWeek.rent.income).toBe(35_000);
    expect(state.ledger.previousWeek.upkeep.expense).toBe(0);
    expect(state.ledger.currentWeek.rent.income).toBe(5_000);
    expect(state.ledger.currentWeek.upkeep.expense).toBe(-20_000);
    expect(state.money).toBe(STARTING_MONEY + 8 * 5_000 - 20_000);
  });

  it('rolls exactly at Monday 00:00 and not one step before', () => {
    const beforeMonday = moneyEngine.step(createTower(1), [], STEPS_PER_WEEK - 1).state;
    expect(beforeMonday.ledger.currentWeek.rent.income).toBe(35_000);
    expect(beforeMonday.ledger.previousWeek.rent.income).toBe(0);
    const monday = moneyEngine.step(beforeMonday, [], 1).state;
    expect(monday.ledger.currentWeek.rent.income).toBe(0);
    expect(monday.ledger.previousWeek.rent.income).toBe(35_000);
  });

  it('keeps upkeep in the week it pays for', () => {
    const { state } = moneyEngine.runDays(createTower(1), 15);
    expect(state.ledger.previousWeek.upkeep.expense).toBe(-20_000);
    expect(state.ledger.previousWeek.rent.income).toBe(35_000);
    expect(state.ledger.currentWeek.upkeep.expense).toBe(-20_000);
  });

  it('lets weekly upkeep drive the balance negative and keeps charging', () => {
    const upkeepOnly = createEngine({
      commandHandlers: {},
      systems: [createScheduler([ledgerWeekRollHook, weeklyUpkeep])],
    });
    const firstMonday = upkeepOnly.runDays(towerWithMoney(10_000), 7).state;
    expect(firstMonday.money).toBe(-10_000);
    const secondMonday = upkeepOnly.runDays(firstMonday, 7).state;
    expect(secondMonday.money).toBe(-30_000);
    expect(secondMonday.ledger.previousWeek.upkeep.expense).toBe(-20_000);
    expect(constructionFundsError(secondMonday, 0)).toBe('NEGATIVE_BALANCE');
  });
});

describe('default tower engine', () => {
  it('rolls the ledger at Monday 00:00', () => {
    const tower = createTower(1);
    creditMoney(tower, 'hotel', 12_000);
    const { state } = runDays(tower, 7);
    expect(state.ledger.previousWeek.hotel.income).toBe(12_000);
    expect(state.ledger.currentWeek.hotel.income).toBe(0);
  });

  it('does not roll during the first week', () => {
    const tower = createTower(1);
    creditMoney(tower, 'hotel', 12_000);
    const { state } = runDays(tower, 6);
    expect(state.ledger.currentWeek.hotel.income).toBe(12_000);
    expect(state.step).toBe(6 * STEPS_PER_DAY);
  });

  it('lists every category in both weeks after a roll', () => {
    const { state } = runDays(createTower(1), 7);
    expect(Object.keys(state.ledger.previousWeek)).toEqual([...LEDGER_CATEGORIES]);
  });
});
