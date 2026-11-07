import { MONEY_CAP, STARTING_MONEY, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from '../hash';
import { chargeMoney, creditMoney, emptyWeekTotals, rollLedgerWeek } from '../money';
import { createTower } from '../state';
import { migrateState, StateMigrationError } from './index';

function towerWithFinances(): TowerState {
  const tower = createTower(3);
  creditMoney(tower, 'rent', 40_000);
  chargeMoney(tower, 'upkeep', 20_000);
  rollLedgerWeek(tower);
  creditMoney(tower, 'venues', 6_000);
  chargeMoney(tower, 'venues', 1_500);
  chargeMoney(tower, 'construction', 2_100_000);
  return tower;
}

function saved(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(createTower(3))), ...overrides };
}

describe('migrateState money and ledger', () => {
  it('round-trips a negative balance and both ledger weeks', () => {
    const tower = towerWithFinances();
    const loaded = migrateState(JSON.parse(JSON.stringify(tower)));
    expect(loaded.money).toBe(-75_500);
    expect(loaded).toEqual(tower);
    expect(hashState(loaded)).toBe(hashState(tower));
  });

  it('gives a save without money the starting balance and empty weeks', () => {
    const raw = saved({});
    delete raw.money;
    delete raw.ledger;
    const loaded = migrateState(raw);
    expect(loaded.money).toBe(STARTING_MONEY);
    expect(loaded.ledger).toEqual({
      currentWeek: emptyWeekTotals(),
      previousWeek: emptyWeekTotals(),
    });
  });

  it.each([
    ['a fractional balance', { money: 10.5 }],
    ['a balance above the cap', { money: MONEY_CAP + 1 }],
    ['a text balance', { money: '100' }],
    ['a ledger that is not an object', { ledger: [] }],
    ['a missing week', { ledger: { currentWeek: emptyWeekTotals() } }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => migrateState(saved(overrides))).toThrow(StateMigrationError);
  });

  it('rejects a week missing a category or holding a total of the wrong sign', () => {
    const missing: Record<string, unknown> = emptyWeekTotals();
    delete missing.films;
    const wrongSign = { ...emptyWeekTotals(), rent: { income: 0, expense: 5 } };
    for (const week of [missing, wrongSign]) {
      const ledger = { currentWeek: week, previousWeek: emptyWeekTotals() };
      expect(() => migrateState(saved({ ledger }))).toThrow(StateMigrationError);
    }
  });

  it('drops unknown keys inside the ledger', () => {
    const week = { ...emptyWeekTotals(), lottery: { income: 9, expense: 0 } };
    const loaded = migrateState(saved({ ledger: { currentWeek: week, previousWeek: week } }));
    expect(loaded.ledger.currentWeek).toEqual(emptyWeekTotals());
  });
});
