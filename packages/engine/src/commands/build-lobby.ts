import {
  levelAbove,
  TOWER_LAYOUT,
  type ColumnSpan,
  type ErrorCode,
  type GridState,
  type Level,
  type LobbyHeight,
} from '@tower-magnate/shared';
import { isSpanFree, setStructure, spanError, structureAt } from '../grid';
import type { CommandHandler } from '../step';
import { columnRuns, columnsBetween, isInteger, isSupported, pricePerCell } from './structure';

const LOBBY_HEIGHTS: readonly unknown[] = [1, 2, 3];
const SKY_LOBBY_LEVELS: readonly Level[] = TOWER_LAYOUT.skyLobbyFloors;

function isLobbyHeight(value: unknown): value is LobbyHeight {
  return LOBBY_HEIGHTS.includes(value);
}

function isMainLobbyLevel(level: Level): boolean {
  return level === TOWER_LAYOUT.mainLobbyFloor;
}

function isLobbyLevel(level: Level): boolean {
  return isMainLobbyLevel(level) || SKY_LOBBY_LEVELS.includes(level);
}

/** The lobby level and the levels above it that a lobby of this height covers. */
function lobbyRows(level: Level, height: LobbyHeight): Level[] {
  const rows: Level[] = [level];
  let row: Level | null = level;
  while (rows.length < height) {
    row = levelAbove(row);
    if (row === null) break;
    rows.push(row);
  }
  return rows;
}

function heightOnLevel(grid: GridState, level: Level): LobbyHeight | null {
  if (isMainLobbyLevel(level)) return grid.mainLobbyHeight;
  return grid.skyLobbyHeights[level] ?? null;
}

function recordHeight(grid: GridState, level: Level, height: LobbyHeight): void {
  if (isMainLobbyLevel(level)) {
    grid.mainLobbyHeight = height;
  } else {
    grid.skyLobbyHeights[level] = height;
  }
}

function mainLobbyExtent(grid: GridState): ColumnSpan | null {
  const lobbySpans = (grid.levels[TOWER_LAYOUT.mainLobbyFloor]?.structure ?? []).filter(
    (span) => span.kind === 'lobby',
  );
  const first = lobbySpans[0];
  const last = lobbySpans.at(-1);
  return first && last ? { x0: first.x0, x1: last.x1 } : null;
}

/** C-19: a new main lobby run must touch or overlap the lobby already there. */
function touchesMainLobby(grid: GridState, x0: number, x1: number): boolean {
  const extent = mainLobbyExtent(grid);
  return extent === null || (x0 <= extent.x1 + 1 && x1 >= extent.x0 - 1);
}

/** C-18 and C-19, in the order of construction spec section 9. */
function lobbyRuleError(
  grid: GridState,
  level: Level,
  height: LobbyHeight,
  x0: number,
  x1: number,
): ErrorCode | null {
  const existingHeight = heightOnLevel(grid, level);
  if (existingHeight !== null && existingHeight !== height) return 'LOBBY_HEIGHT_MISMATCH';
  if (isMainLobbyLevel(level) && !touchesMainLobby(grid, x0, x1)) return 'LOBBY_NOT_CONTIGUOUS';
  return null;
}

export const buildLobby: CommandHandler<'buildLobby'> = (context, command) => {
  const { level, x0, x1, height } = command;
  if (!isInteger(level) || !isInteger(x0) || !isInteger(x1) || x1 < x0 || !isLobbyHeight(height)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const boundsError = spanError(level, x0, x1);
  if (boundsError) {
    return { ok: false, error: boundsError };
  }
  if (!isLobbyLevel(level)) {
    return { ok: false, error: 'LOBBY_FLOOR_NOT_ALLOWED' };
  }

  const grid = context.state.grid;
  const rows = lobbyRows(level, height);
  const columns = columnsBetween(x0, x1).filter((x) => structureAt(grid, level, x) !== 'lobby');
  const runs = columnRuns(columns);
  const occupied = runs.some((run) => rows.some((row) => !isSpanFree(grid, row, run.x0, run.x1)));
  if (occupied) {
    return { ok: false, error: 'CELL_OCCUPIED' };
  }
  if (columns.length === 0) {
    return { ok: false, error: 'NOTHING_TO_BUILD' };
  }
  if (!columns.every((x) => isSupported(grid, level, x))) {
    return { ok: false, error: 'NO_SUPPORT' };
  }
  const ruleError = lobbyRuleError(grid, level, height, x0, x1);
  if (ruleError) {
    return { ok: false, error: ruleError };
  }

  for (const row of rows) {
    for (const run of runs) {
      setStructure(grid, row, run.x0, run.x1, 'lobby');
    }
  }
  recordHeight(grid, level, height);
  const cost = columns.length * rows.length * pricePerCell('lobby');
  return { ok: true, cost, refund: 0, events: [] };
};
