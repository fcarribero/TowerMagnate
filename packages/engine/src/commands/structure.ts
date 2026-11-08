import {
  levelAbove,
  levelBelow,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type ColumnSpan,
  type ErrorCode,
  type FloorPurchase,
  type GridState,
  type Level,
  type LobbyPurchase,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { occupantAt, structureAt } from '../grid';
import { chargeMoney, constructionFundsError, creditMoney } from '../money';

/** Floor, lobby, or a cell covered by a unit (construction spec section 1). */
export function hasStructure(grid: GridState, level: Level, x: number): boolean {
  return structureAt(grid, level, x) !== null || occupantAt(grid, level, x)?.kind === 'unit';
}

/** C-03 and C-04: above ground a cell rests on the one below, a basement hangs from the one above. */
export function isSupported(grid: GridState, level: Level, x: number): boolean {
  if (level === TOWER_LAYOUT.mainLobbyFloor) return true;
  const neighbour = level > 0 ? levelBelow(level) : levelAbove(level);
  return neighbour !== null && hasStructure(grid, neighbour, x);
}

/** Groups sorted, distinct columns into runs of consecutive columns. */
export function columnRuns(columns: readonly number[]): ColumnSpan[] {
  const runs: ColumnSpan[] = [];
  for (const x of columns) {
    const last = runs.at(-1);
    if (last && last.x1 + 1 === x) {
      last.x1 = x;
    } else {
      runs.push({ x0: x, x1: x });
    }
  }
  return runs;
}

export function columnsBetween(x0: number, x1: number): number[] {
  const columns: number[] = [];
  for (let x = x0; x <= x1; x++) columns.push(x);
  return columns;
}

export function pricePerCell(unitType: UnitType): number {
  const cost = UNIT_CATALOG[unitType].cost;
  if (cost.kind !== 'per-cell') {
    throw new Error(`${unitType} is not priced per cell`);
  }
  return cost.amount;
}

export function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

/** C-54: no construction at all while the balance is below zero. */
export function negativeBalanceError(state: TowerState): ErrorCode | null {
  return state.money < 0 ? 'NEGATIVE_BALANCE' : null;
}

/** C-55: the last check of a construction command. Charges the cost when the balance covers it. */
export function payForConstruction(state: TowerState, cost: number): ErrorCode | null {
  const fundsError = constructionFundsError(state, cost);
  if (fundsError) return fundsError;
  chargeMoney(state, 'construction', cost);
  return null;
}

/** C-62: one game hour, 360 steps. */
export const REFUND_WINDOW_STEPS = 360;

function isYoung(state: TowerState, placedAtStep: number): boolean {
  return state.step - placedAtStep < REFUND_WINDOW_STEPS;
}

/** C-62 and C-63: pays back what was paid when the object is young and unused; returns the credited amount. */
export function refundConstruction(
  state: TowerState,
  object: { paid: number; placedAtStep: number; used?: boolean },
): number {
  if (!isYoung(state, object.placedAtStep) || object.used || object.paid === 0) return 0;
  return creditMoney(state, 'construction', object.paid);
}

function youngPurchases<T extends { placedAtStep: number }>(
  state: TowerState,
  purchases: readonly T[],
): T[] {
  return purchases.filter((purchase) => isYoung(state, purchase.placedAtStep));
}

/**
 * Splits young purchases on `level` around the demolished `columns`. Returns the purchases left
 * and how many demolished columns each priced purchase covered, as a total in dollars.
 */
function takeColumns<T extends ColumnSpan & { level: Level; placedAtStep: number }>(
  state: TowerState,
  purchases: readonly T[],
  level: Level,
  columns: readonly number[],
  pricePerColumn: (purchase: T) => number,
): { kept: T[]; amount: number } {
  const demolished = new Set(columns);
  let amount = 0;
  const kept: T[] = [];
  for (const purchase of youngPurchases(state, purchases)) {
    if (purchase.level !== level) {
      kept.push(purchase);
      continue;
    }
    const cells = columnsBetween(purchase.x0, purchase.x1);
    const remaining = cells.filter((x) => !demolished.has(x));
    amount += (cells.length - remaining.length) * pricePerColumn(purchase);
    for (const run of columnRuns(remaining)) kept.push({ ...purchase, ...run });
  }
  return { kept, amount };
}

/** Remembers floor bought with the floor tool so it can be refunded within the window. */
export function recordFloorPurchase(
  state: TowerState,
  level: Level,
  runs: readonly ColumnSpan[],
  paidPerCell: number,
): void {
  state.floorPurchases = youngPurchases(state, state.floorPurchases);
  for (const run of runs) {
    state.floorPurchases.push({ level, ...run, paidPerCell, placedAtStep: state.step });
  }
}

/**
 * C-62 and C-63 for the floor tool: pays back the young purchased cells among the demolished
 * `columns` and forgets them. Floor that came with a unit has no purchase and refunds nothing.
 */
export function refundFloor(state: TowerState, level: Level, columns: readonly number[]): number {
  const { kept, amount } = takeColumns(
    state,
    state.floorPurchases,
    level,
    columns,
    (purchase: FloorPurchase) => purchase.paidPerCell,
  );
  state.floorPurchases = kept;
  return amount === 0 ? 0 : creditMoney(state, 'construction', amount);
}

/** Remembers sky lobby columns bought on a lobby level so they can be refunded within the window. */
export function recordLobbyPurchase(
  state: TowerState,
  level: Level,
  runs: readonly ColumnSpan[],
  paidPerColumn: number,
): void {
  state.lobbyPurchases = youngPurchases(state, state.lobbyPurchases);
  for (const run of runs) {
    state.lobbyPurchases.push({ level, ...run, paidPerColumn, placedAtStep: state.step });
  }
}

/**
 * Section 8.4 for sky lobbies: pays back the lobby price of the young demolished columns on the
 * lobby level `level`. Floor that was under the lobby is not part of it and refunds nothing here.
 */
export function refundLobby(state: TowerState, level: Level, columns: readonly number[]): number {
  const { kept, amount } = takeColumns(
    state,
    state.lobbyPurchases,
    level,
    columns,
    (purchase: LobbyPurchase) => purchase.paidPerColumn,
  );
  state.lobbyPurchases = kept;
  return amount === 0 ? 0 : creditMoney(state, 'construction', amount);
}
