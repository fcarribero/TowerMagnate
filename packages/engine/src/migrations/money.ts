import {
  LEDGER_CATEGORIES,
  MONEY_CAP,
  STARTING_MONEY,
  type CategoryTotals,
  type Ledger,
  type WeekTotals,
} from '@tower-magnate/shared';
import { createLedger } from '../money';
import { isRecord, StateMigrationError } from './errors';

/** Towers saved before money existed have no `money`; they start with the starting balance. */
export function readMoney(raw: unknown): number {
  if (raw === undefined) {
    return STARTING_MONEY;
  }
  if (!Number.isSafeInteger(raw) || (raw as number) > MONEY_CAP) {
    throw new StateMigrationError(`State money must be a whole number up to ${MONEY_CAP}`);
  }
  return raw as number;
}

/** Towers saved before the ledger existed have no `ledger`; they start with empty weeks. */
export function readLedger(raw: unknown): Ledger {
  if (raw === undefined) {
    return createLedger();
  }
  if (!isRecord(raw)) {
    throw new StateMigrationError('State ledger must be an object');
  }
  return {
    currentWeek: readWeekTotals(raw.currentWeek, 'currentWeek'),
    previousWeek: readWeekTotals(raw.previousWeek, 'previousWeek'),
  };
}

function readWeekTotals(raw: unknown, week: string): WeekTotals {
  if (!isRecord(raw)) {
    throw new StateMigrationError(`Ledger ${week} must be an object`);
  }
  const totals = {} as WeekTotals;
  for (const category of LEDGER_CATEGORIES) {
    totals[category] = readCategoryTotals(raw[category], `${week}.${category}`);
  }
  return totals;
}

function readCategoryTotals(raw: unknown, where: string): CategoryTotals {
  const valid =
    isRecord(raw) &&
    Number.isSafeInteger(raw.income) &&
    (raw.income as number) >= 0 &&
    Number.isSafeInteger(raw.expense) &&
    (raw.expense as number) <= 0;
  if (!valid) {
    throw new StateMigrationError(`Ledger ${where} must hold income >= 0 and expense <= 0`);
  }
  return { income: raw.income as number, expense: raw.expense as number };
}
