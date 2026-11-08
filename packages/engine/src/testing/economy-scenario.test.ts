import { describe, expect, it } from 'vitest';
import { createLedger } from '../money';
import { firstLedgerMismatch, ledgerChanges, type EconomyDay } from './economy-scenario';

function day(index: number, balance: number, changes: EconomyDay['changes']): EconomyDay {
  return {
    day: index,
    firstStep: index * 8640 + 1,
    lastStep: (index + 1) * 8640,
    balance,
    changes,
  };
}

describe('ledgerChanges', () => {
  it('reports what each category moved inside one week', () => {
    const before = createLedger();
    before.currentWeek.rent.income = 10_000;
    const after = createLedger();
    after.currentWeek.rent.income = 25_000;
    after.currentWeek.venues.expense = -3_000;

    expect(ledgerChanges(before, after, false)).toEqual({ rent: 15_000, venues: -3_000 });
  });

  it('adds the rolled week and the new week when a Monday falls inside the span', () => {
    const before = createLedger();
    before.currentWeek.hotel.income = 4_000;
    const after = createLedger();
    after.previousWeek.hotel.income = 10_000;
    after.currentWeek.upkeep.expense = -131_000;

    expect(ledgerChanges(before, after, true)).toEqual({ hotel: 6_000, upkeep: -131_000 });
  });
});

describe('firstLedgerMismatch', () => {
  it('is null when every day matches', () => {
    const days = [day(0, 100, { rent: 100 })];
    expect(firstLedgerMismatch(days, [{ balance: 100, changes: { rent: 100 } }])).toBeNull();
  });

  it('names the first wrong day and the category that differs', () => {
    const actual = [day(0, 100, { rent: 100 }), day(1, 150, { hotel: 50 }), day(2, 0, {})];
    const expected = [
      { balance: 100, changes: { rent: 100 } },
      { balance: 160, changes: { hotel: 60 } },
      { balance: 1, changes: {} },
    ];

    const diff = firstLedgerMismatch(actual, expected);

    expect(diff).toContain('day 1 (tuesday, steps 8641 to 17280)');
    expect(diff).toContain('hotel          expected 60, got 50   <- differs');
    expect(diff).toContain('balance        expected 160, got 150   <- differs');
    expect(diff).not.toContain('day 2');
  });

  it('says so when the run has a different number of days', () => {
    expect(firstLedgerMismatch([], [{ balance: 0, changes: {} }])).toBe(
      'Expected 1 days, the run has 0',
    );
  });
});
