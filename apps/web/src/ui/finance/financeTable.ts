import type {
  FinanceSummary,
  FinanceWeek,
  LedgerCategory,
  MoneyReason,
} from '@tower-magnate/shared';
import { LEDGER_CATEGORIES } from '@tower-magnate/shared';

const CATEGORY_OF_REASON: Record<MoneyReason, LedgerCategory> = {
  rent: 'rent',
  hotel: 'hotel',
  sale: 'condoSales',
  dailyPayout: 'venues',
  ransom: 'events',
  treasure: 'events',
  helicopter: 'events',
  construction: 'construction',
  refund: 'construction',
  upkeep: 'upkeep',
  condoBuyback: 'condoBuybacks',
  film: 'films',
};

export interface WeekColumn {
  /** Net amount per category: income plus expenses. */
  net: Record<LedgerCategory, number>;
  totalIncome: number;
  totalExpenses: number;
  result: number;
}

export interface FinanceTable {
  categories: readonly LedgerCategory[];
  thisWeek: WeekColumn;
  lastWeek: WeekColumn;
}

function emptyNet(): Record<LedgerCategory, number> {
  return Object.fromEntries(LEDGER_CATEGORIES.map((category) => [category, 0])) as Record<
    LedgerCategory,
    number
  >;
}

export function weekColumn(week: FinanceWeek | null): WeekColumn {
  const net = emptyNet();
  let totalIncome = 0;
  let totalExpenses = 0;
  const entries: [Partial<Record<MoneyReason, number>>, boolean][] = [
    [week?.income ?? {}, true],
    [week?.expenses ?? {}, false],
  ];
  for (const [amounts, isIncome] of entries) {
    for (const [reason, amount] of Object.entries(amounts) as [MoneyReason, number][]) {
      net[CATEGORY_OF_REASON[reason]] += amount;
      if (isIncome) {
        totalIncome += amount;
      } else {
        totalExpenses += amount;
      }
    }
  }
  return { net, totalIncome, totalExpenses, result: totalIncome + totalExpenses };
}

export function financeTable(finances: FinanceSummary): FinanceTable {
  return {
    categories: LEDGER_CATEGORIES,
    thisWeek: weekColumn(finances.thisWeek),
    lastWeek: weekColumn(finances.lastWeek),
  };
}
