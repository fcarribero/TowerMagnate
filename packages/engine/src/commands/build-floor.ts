import {
  CATHEDRAL_BOTTOM_LEVEL,
  TOWER_LAYOUT,
  type GridState,
  type Level,
} from '@tower-magnate/shared';
import { occupantAt, setStructure, spanError, structureAt } from '../grid';
import type { CommandHandler } from '../step';
import {
  columnRuns,
  columnsBetween,
  isInteger,
  isSupported,
  negativeBalanceError,
  payForConstruction,
  pricePerCell,
  recordFloorPurchase,
} from './structure';

/** Cells of the run that would get new floor: no structure and nothing on them. */
function newFloorColumns(grid: GridState, level: Level, x0: number, x1: number): number[] {
  return columnsBetween(x0, x1).filter(
    (x) => structureAt(grid, level, x) === null && occupantAt(grid, level, x) === null,
  );
}

export const buildFloor: CommandHandler<'buildFloor'> = (context, command) => {
  const { level, x0, x1 } = command;
  if (!isInteger(level) || !isInteger(x0) || !isInteger(x1) || x1 < x0) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const balanceError = negativeBalanceError(context.state);
  if (balanceError) {
    return { ok: false, error: balanceError };
  }
  const boundsError = spanError(level, x0, x1);
  if (boundsError) {
    return { ok: false, error: boundsError };
  }
  if (level === TOWER_LAYOUT.mainLobbyFloor) {
    return { ok: false, error: 'LOBBY_LEVEL_ONLY' };
  }
  if (level > CATHEDRAL_BOTTOM_LEVEL) {
    return { ok: false, error: 'CATHEDRAL_LEVEL_ONLY' };
  }

  const grid = context.state.grid;
  const columns = newFloorColumns(grid, level, x0, x1);
  if (columns.length === 0) {
    return { ok: false, error: 'NOTHING_TO_BUILD' };
  }
  if (!columns.every((x) => isSupported(grid, level, x))) {
    return { ok: false, error: 'NO_SUPPORT' };
  }

  const paidPerCell = pricePerCell('floor');
  const cost = columns.length * paidPerCell;
  const paymentError = payForConstruction(context.state, cost);
  if (paymentError) {
    return { ok: false, error: paymentError };
  }

  const runs = columnRuns(columns);
  for (const run of runs) {
    setStructure(grid, level, run.x0, run.x1, 'floor');
  }
  recordFloorPurchase(context.state, level, runs, paidPerCell);
  return { ok: true, cost, refund: 0, events: [] };
};
