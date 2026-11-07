/** Finance categories, economy spec table 9.1, in the order the finance window lists them. */
export const LEDGER_CATEGORIES = [
  'rent',
  'hotel',
  'condoSales',
  'venues',
  'events',
  'construction',
  'upkeep',
  'condoBuybacks',
  'films',
] as const;

export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

/** Whole dollars. `income` sums the positive entries, `expense` the negative ones (zero or less). */
export interface CategoryTotals {
  income: number;
  expense: number;
}

export type WeekTotals = Record<LedgerCategory, CategoryTotals>;

export interface Ledger {
  currentWeek: WeekTotals;
  previousWeek: WeekTotals;
}

export function isLedgerCategory(value: unknown): value is LedgerCategory {
  return (LEDGER_CATEGORIES as readonly unknown[]).includes(value);
}
