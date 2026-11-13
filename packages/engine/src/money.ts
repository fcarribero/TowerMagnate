import {
  LEDGER_CATEGORIES,
  MONEY_CAP,
  type EngineEvent,
  type ErrorCode,
  type Ledger,
  type LedgerCategory,
  type MoneyReason,
  type TowerState,
  type UnitId,
  type WeekTotals,
} from '@tower-magnate/shared';
import { WEEKDAYS } from './calendar';
import type { ScheduledHook } from './scheduler';

export function emptyWeekTotals(): WeekTotals {
  const totals = {} as WeekTotals;
  for (const category of LEDGER_CATEGORIES) {
    totals[category] = { income: 0, expense: 0 };
  }
  return totals;
}

export function createLedger(): Ledger {
  return { currentWeek: emptyWeekTotals(), previousWeek: emptyWeekTotals() };
}

function assertWholeDollars(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Money amount must be a non-negative whole number, got ${amount}`);
  }
}

/**
 * Adds income to the balance, up to MONEY_CAP. The excess is lost and not recorded.
 * Returns the amount actually credited.
 */
export function creditMoney(state: TowerState, category: LedgerCategory, amount: number): number {
  assertWholeDollars(amount);
  const room = Math.max(0, MONEY_CAP - state.money);
  const credited = Math.min(amount, room);
  state.money += credited;
  state.ledger.currentWeek[category].income += credited;
  return credited;
}

/** Takes an expense from the balance in full, even when that leaves it below zero. */
export function chargeMoney(state: TowerState, category: LedgerCategory, amount: number): void {
  assertWholeDollars(amount);
  state.money -= amount;
  state.ledger.currentWeek[category].expense -= amount;
}

/** Reports money tied to a unit, so the screen can float the amount over it. Zero is not reported. */
export function pushUnitMoney(
  context: { state: TowerState; events: EngineEvent[] },
  unitId: UnitId,
  amount: number,
  reason: MoneyReason,
): void {
  if (amount === 0) return;
  context.events.push({ type: 'unitMoney', step: context.state.step, unitId, amount, reason });
}

/** Moves this week's totals to the previous week and starts the new week at zero. */
export function rollLedgerWeek(state: TowerState): void {
  state.ledger.previousWeek = state.ledger.currentWeek;
  state.ledger.currentWeek = emptyWeekTotals();
}

/** Why a construction of this cost cannot be paid now, or null when it can. */
export function constructionFundsError(state: TowerState, cost: number): ErrorCode | null {
  if (state.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  if (cost > state.money) {
    return 'INSUFFICIENT_FUNDS';
  }
  return null;
}

export interface WeekSummary {
  income: number;
  expense: number;
  result: number;
}

/** The "Total ingresos", "Total gastos" and "Resultado" rows of the finance window. */
export function summarizeWeek(totals: WeekTotals): WeekSummary {
  let income = 0;
  let expense = 0;
  for (const category of LEDGER_CATEGORIES) {
    income += totals[category].income;
    expense += totals[category].expense;
  }
  return { income, expense, result: income + expense };
}

/** Must be listed before the upkeep hook, so upkeep lands in the week it pays for. */
export const ledgerWeekRollHook: ScheduledHook = {
  name: 'ledger-week-roll',
  schedule: { every: 'week', weekday: WEEKDAYS.monday, hour: 0, minute: 0 },
  run(context) {
    rollLedgerWeek(context.state);
  },
};
