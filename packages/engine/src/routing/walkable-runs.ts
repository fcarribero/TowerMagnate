import {
  levelAbove,
  UNIT_CATALOG,
  type ColumnSpan,
  type Level,
  type OccupantSpan,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';

/** The one row of a unit that people can stand on: the bottom row, or the top row of the subway station. */
export function walkableLevelOfUnit(unit: Unit): Level {
  if (unit.type !== 'subway-station') return unit.level;
  const { height } = UNIT_CATALOG[unit.type];
  const floors = height.kind === 'fixed' ? height.floors : 1;
  let level = unit.level;
  for (let climbed = 1; climbed < floors; climbed++) {
    level = levelAbove(level) ?? level;
  }
  return level;
}

function blocksWalking(state: TowerState, level: Level, span: OccupantSpan): boolean {
  const { occupant } = span;
  if (occupant.kind === 'ruins') return true;
  if (occupant.kind !== 'unit') return false;
  const unit = state.units[occupant.id];
  return unit !== undefined && walkableLevelOfUnit(unit) !== level;
}

function subtract(span: ColumnSpan, blocked: readonly ColumnSpan[]): ColumnSpan[] {
  const pieces: ColumnSpan[] = [];
  let x0 = span.x0;
  for (const cut of blocked) {
    if (cut.x1 < x0 || cut.x0 > span.x1) continue;
    if (cut.x0 > x0) pieces.push({ x0, x1: cut.x0 - 1 });
    x0 = Math.max(x0, cut.x1 + 1);
  }
  if (x0 <= span.x1) pieces.push({ x0, x1: span.x1 });
  return pieces;
}

/**
 * Routing section 2: the maximal horizontal runs of walkable cells on a level, sorted by column.
 * Cells with structure are walkable unless they hold ruins or a unit row people cannot stand on.
 */
export function walkableRuns(state: TowerState, level: Level): ColumnSpan[] {
  const row = state.grid.levels[level];
  if (!row) return [];
  const blocked = row.occupants.filter((span) => blocksWalking(state, level, span));
  const runs: ColumnSpan[] = [];
  for (const structure of row.structure) {
    for (const piece of subtract(structure, blocked)) {
      const last = runs[runs.length - 1];
      if (last && last.x1 + 1 === piece.x0) last.x1 = piece.x1;
      else runs.push(piece);
    }
  }
  return runs;
}
