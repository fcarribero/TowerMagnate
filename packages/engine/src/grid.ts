import {
  isColumn,
  isLevel,
  LOWEST_LEVEL,
  type ColumnSpan,
  type ErrorCode,
  type GridState,
  type Level,
  type LevelRow,
  type OccupantRef,
  type OccupantSpan,
  type StructureKind,
  type StructureSpan,
} from '@tower-magnate/shared';

export function createGrid(): GridState {
  return { levels: {}, mainLobbyHeight: null, skyLobbyHeights: {} };
}

/** C-02: the subway tunnel level is reserved, anything else off the grid is out of bounds. */
export function levelError(level: number): ErrorCode | null {
  if (level === LOWEST_LEVEL) return 'LEVEL_RESERVED';
  if (!isLevel(level)) return 'OUT_OF_BOUNDS';
  return null;
}

/** C-01 and C-02 for a run of cells on one level. */
export function spanError(level: number, x0: number, x1: number): ErrorCode | null {
  const error = levelError(level);
  if (error) return error;
  if (!isColumn(x0) || !isColumn(x1)) return 'OUT_OF_BOUNDS';
  if (x0 > x1) return 'INVALID_COMMAND';
  return null;
}

export function structureAt(grid: GridState, level: Level, x: number): StructureKind | null {
  const span = grid.levels[level]?.structure.find((candidate) => covers(candidate, x));
  return span?.kind ?? null;
}

export function cellsWithoutStructure(
  grid: GridState,
  level: Level,
  x0: number,
  x1: number,
): number {
  let covered = 0;
  for (const span of grid.levels[level]?.structure ?? []) {
    covered += overlapLength(span, x0, x1);
  }
  return x1 - x0 + 1 - covered;
}

export function setStructure(
  grid: GridState,
  level: Level,
  x0: number,
  x1: number,
  kind: StructureKind,
): void {
  assertSpan(level, x0, x1);
  const row = rowFor(grid, level);
  const kept = cutOut(row.structure, x0, x1);
  kept.push({ kind, x0, x1 });
  kept.sort(byStartColumn);
  row.structure = mergeAdjacent(kept);
}

export function clearStructure(grid: GridState, level: Level, x0: number, x1: number): void {
  assertSpan(level, x0, x1);
  const row = grid.levels[level];
  if (!row) return;
  row.structure = cutOut(row.structure, x0, x1);
  dropRowIfEmpty(grid, level);
}

/**
 * The grid has two layers. The back layer holds units, lobbies and ruins. The front layer holds
 * stairs, escalators and elevator shafts, which pass over the back layer. Things of the same layer
 * never share a cell.
 */
export function isOverlay(occupant: OccupantRef): boolean {
  return occupant.kind === 'transport' || occupant.kind === 'shaft';
}

/** What fills a cell: the back layer first (unit or ruins), then a stair or shaft over it. */
export function occupantAt(grid: GridState, level: Level, x: number): OccupantRef | null {
  const spans = (grid.levels[level]?.occupants ?? []).filter((candidate) => covers(candidate, x));
  const base = spans.find((span) => !isOverlay(span.occupant));
  return (base ?? spans[0])?.occupant ?? null;
}

/** Every occupant on the level that shares at least one cell with x0..x1. */
export function overlappingOccupants(
  grid: GridState,
  level: Level,
  x0: number,
  x1: number,
): OccupantSpan[] {
  const overlapping: OccupantSpan[] = [];
  for (const span of grid.levels[level]?.occupants ?? []) {
    if (span.x0 > x1) break;
    if (span.x1 >= x0) overlapping.push(span);
  }
  return overlapping;
}

export function isSpanFree(grid: GridState, level: Level, x0: number, x1: number): boolean {
  return overlappingOccupants(grid, level, x0, x1).length === 0;
}

/** Whether the back layer (units, lobbies, ruins) is empty on x0..x1; stairs and shafts pass over it. */
export function isBackSpanFree(grid: GridState, level: Level, x0: number, x1: number): boolean {
  return overlappingOccupants(grid, level, x0, x1).every((span) => isOverlay(span.occupant));
}

export function addOccupant(
  grid: GridState,
  level: Level,
  x0: number,
  x1: number,
  occupant: OccupantRef,
): void {
  assertSpan(level, x0, x1);
  const clashes = overlappingOccupants(grid, level, x0, x1).some(
    (span) => isOverlay(occupant) === isOverlay(span.occupant),
  );
  if (clashes) {
    throw new Error(`Cells ${x0}..${x1} on level ${level} are already occupied`);
  }
  const row = rowFor(grid, level);
  row.occupants.push({ x0, x1, occupant });
  row.occupants.sort(byStartColumn);
}

/** Removes every span of the occupant on the level and returns how many cells it freed. */
export function removeOccupant(grid: GridState, level: Level, occupant: OccupantRef): number {
  const row = grid.levels[level];
  if (!row) return 0;
  let freed = 0;
  row.occupants = row.occupants.filter((span) => {
    if (!sameOccupant(span.occupant, occupant)) return true;
    freed += span.x1 - span.x0 + 1;
    return false;
  });
  dropRowIfEmpty(grid, level);
  return freed;
}

/** Frees the single cell x on the level if ruins stand there; other ruins on the level stay. */
export function clearRuinsAt(grid: GridState, level: Level, x: number): boolean {
  const row = grid.levels[level];
  const span = row?.occupants.find((candidate) => covers(candidate, x));
  if (!row || span?.occupant.kind !== 'ruins') return false;
  const rest = row.occupants.filter((candidate) => candidate !== span);
  if (span.x0 < x) rest.push({ x0: span.x0, x1: x - 1, occupant: span.occupant });
  if (span.x1 > x) rest.push({ x0: x + 1, x1: span.x1, occupant: span.occupant });
  row.occupants = rest.sort(byStartColumn);
  dropRowIfEmpty(grid, level);
  return true;
}

function sameOccupant(a: OccupantRef, b: OccupantRef): boolean {
  if (a.kind === 'ruins' || b.kind === 'ruins') return a.kind === b.kind;
  if (a.kind !== b.kind || a.id !== b.id) return false;
  if (a.kind === 'transport' && b.kind === 'transport') return a.part === b.part;
  return true;
}

function rowFor(grid: GridState, level: Level): LevelRow {
  let row = grid.levels[level];
  if (!row) {
    row = { structure: [], occupants: [] };
    grid.levels[level] = row;
  }
  return row;
}

function dropRowIfEmpty(grid: GridState, level: Level): void {
  const row = grid.levels[level];
  if (row && row.structure.length === 0 && row.occupants.length === 0) {
    Reflect.deleteProperty(grid.levels, level);
  }
}

/** Returns the spans with the cells x0..x1 removed, splitting any span that straddles them. */
function cutOut(spans: StructureSpan[], x0: number, x1: number): StructureSpan[] {
  const kept: StructureSpan[] = [];
  for (const span of spans) {
    if (span.x1 < x0 || span.x0 > x1) {
      kept.push(span);
      continue;
    }
    if (span.x0 < x0) kept.push({ kind: span.kind, x0: span.x0, x1: x0 - 1 });
    if (span.x1 > x1) kept.push({ kind: span.kind, x0: x1 + 1, x1: span.x1 });
  }
  return kept;
}

function mergeAdjacent(sorted: StructureSpan[]): StructureSpan[] {
  const merged: StructureSpan[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && last.kind === span.kind && last.x1 + 1 === span.x0) {
      last.x1 = span.x1;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function covers(span: ColumnSpan, x: number): boolean {
  return span.x0 <= x && x <= span.x1;
}

function overlapLength(span: ColumnSpan, x0: number, x1: number): number {
  return Math.max(0, Math.min(span.x1, x1) - Math.max(span.x0, x0) + 1);
}

function byStartColumn(a: ColumnSpan, b: ColumnSpan): number {
  return a.x0 - b.x0;
}

function assertSpan(level: Level, x0: number, x1: number): void {
  const error = spanError(level, x0, x1);
  if (error) {
    throw new RangeError(`Cells ${x0}..${x1} on level ${level} are not on the grid (${error})`);
  }
}
