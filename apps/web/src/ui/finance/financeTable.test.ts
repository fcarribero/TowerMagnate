import { describe, expect, it } from 'vitest';
import { financeTable, weekColumn } from './financeTable';

describe('weekColumn', () => {
  it('nets a mixed category in its row and splits it in the totals', () => {
    const column = weekColumn({
      weekStartStep: 0,
      income: { refund: 10_000, rent: 5_000 },
      expenses: { construction: -4_000, upkeep: -1_000 },
    });
    expect(column.net.construction).toBe(6_000);
    expect(column.totalIncome).toBe(15_000);
    expect(column.totalExpenses).toBe(-5_000);
    expect(column.result).toBe(10_000);
  });

  it('groups the event reasons in one row', () => {
    const column = weekColumn({
      weekStartStep: 0,
      income: { treasure: 3_000 },
      expenses: { ransom: -1_000, helicopter: -500 },
    });
    expect(column.net.events).toBe(1_500);
  });

  it('is all zeros without a previous week', () => {
    const column = weekColumn(null);
    expect(column.result).toBe(0);
    expect(Object.values(column.net).every((amount) => amount === 0)).toBe(true);
  });
});

describe('financeTable', () => {
  it('lists the categories in window order', () => {
    const table = financeTable({
      thisWeek: { weekStartStep: 0, income: {}, expenses: {} },
      lastWeek: null,
    });
    expect(table.categories[0]).toBe('rent');
    expect(table.categories[8]).toBe('films');
  });
});
