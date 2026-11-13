import { TOWER_LAYOUT, type Level } from '@tower-magnate/shared';
import { LOWEST_LEVEL, WORLD_WIDTH } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

export type TimeOfDay = 'day' | 'night';

/** A structure sprite id without its time, such as `floor` or `lobby-2-column`. */
export type StructureSubject = string;

/**
 * One thing to draw in a level row, in zoom 1 pixels from the row's top-left
 * corner. A piece with `width` repeats its sprite sideways to fill it.
 */
export interface StructurePiece {
  subject: StructureSubject;
  x: number;
  y: number;
  width?: number;
}

export type LobbyHeight = 1 | 2 | 3;

export interface StructureSource {
  row(level: Level): string | undefined;
  mainLobbyHeight: LobbyHeight | null;
  /** Cells under a placed unit; floor and basement are not drawn there. */
  covered?(level: Level): string | undefined;
}

const EDGE_WIDTH = 3;
const ROOF_HEIGHT = 4;
const COLUMN_EVERY_TILES = 4;
const MAX_LOBBY_HEIGHT = 3;
const SUBWAY_LEVEL = -TOWER_LAYOUT.subwayTunnelBasement;
const MAIN_LOBBY_LEVEL = TOWER_LAYOUT.mainLobbyFloor;
const SKY_LOBBY_LEVELS: readonly number[] = TOWER_LAYOUT.skyLobbyFloors;

interface Run {
  cell: string;
  from: number;
  to: number;
}

/** Unbuilt soil subject for a basement level: one picture per level, S1 to S9, that blends into the next. */
export function soilSubject(level: Level): StructureSubject {
  return `soil-${Math.min(Math.max(-level, 1), 9)}`;
}

/** Everything drawn in one level row. Level 0 does not exist and gets nothing. */
export function planStructureRow(level: Level, source: StructureSource): StructurePiece[] {
  if (level === 0 || level < LOWEST_LEVEL) {
    return [];
  }
  if (level === SUBWAY_LEVEL) {
    return planSubwayTunnel();
  }
  if (level < 0) {
    return planBasement(level, source.row(level), source.covered?.(level));
  }
  return planAboveGround(level, source);
}

/** The levels whose drawing depends on `level`'s row: itself, the roof below it and the lobby under it. */
export function levelsAffectedBy(level: Level): Level[] {
  const affected = [level];
  const below = level === 1 ? -1 : level - 1;
  if (below >= LOWEST_LEVEL && below > 0) {
    affected.push(below);
  }
  if (level > MAIN_LOBBY_LEVEL && level <= MAIN_LOBBY_LEVEL + MAX_LOBBY_HEIGHT) {
    affected.push(MAIN_LOBBY_LEVEL);
  }
  if (level === MAIN_LOBBY_LEVEL) {
    affected.push(MAIN_LOBBY_LEVEL + 1, MAIN_LOBBY_LEVEL + 2);
  }
  return [...new Set(affected)];
}

function planSubwayTunnel(): StructurePiece[] {
  const pieces: StructurePiece[] = [{ subject: 'subway-tunnel', x: 0, y: 0, width: WORLD_WIDTH }];
  for (
    let column = COLUMN_EVERY_TILES;
    column < TOWER_WIDTH_TILES - 1;
    column += COLUMN_EVERY_TILES
  ) {
    pieces.push({ subject: 'subway-tunnel-lamp', x: column * TILE_WIDTH, y: 0 });
  }
  pieces.push({ subject: 'subway-tunnel-edge-left', x: 0, y: 0 });
  pieces.push({
    subject: 'subway-tunnel-edge-right',
    x: (TOWER_WIDTH_TILES - 1) * TILE_WIDTH,
    y: 0,
  });
  return pieces;
}

function planBasement(
  level: Level,
  row: string | undefined,
  covered: string | undefined,
): StructurePiece[] {
  const pieces: StructurePiece[] = [
    { subject: soilSubject(level), x: 0, y: 0, width: WORLD_WIDTH },
  ];
  for (const run of builtRuns(row)) {
    pieces.push(
      ...bareRun(
        run.cell === 'r' ? 'ruins' : 'basement',
        run,
        run.cell === 'r' ? undefined : covered,
      ),
    );
    pieces.push({ subject: 'basement-edge-left', x: run.from * TILE_WIDTH - EDGE_WIDTH, y: 0 });
    pieces.push({ subject: 'basement-edge-right', x: (run.to + 1) * TILE_WIDTH, y: 0 });
  }
  return pieces;
}

function planAboveGround(level: Level, source: StructureSource): StructurePiece[] {
  const row = drawnRow(level, source);
  if (row === undefined) {
    return [];
  }
  const pieces: StructurePiece[] = [];
  for (const run of builtRuns(row)) {
    pieces.push(
      ...(run.cell === 'l'
        ? lobbyRun(level, run, source)
        : bareRun(
            floorSubject(run.cell),
            run,
            run.cell === 'r' ? undefined : source.covered?.(level),
          )),
    );
  }
  for (const run of runsWhere([...row].map(isBuilt))) {
    pieces.push({ subject: 'edge-left', x: run.from * TILE_WIDTH - EDGE_WIDTH, y: 0 });
    pieces.push({ subject: 'edge-right', x: (run.to + 1) * TILE_WIDTH, y: 0 });
  }
  pieces.push(...roofs(level, row, source));
  return pieces;
}

/**
 * The row as this level draws it. The upper rows of a tall main lobby are
 * drawn by the level 1 sprite, so their lobby cells count as empty here.
 */
function drawnRow(level: Level, source: StructureSource): string | undefined {
  const row = source.row(level);
  const height = source.mainLobbyHeight ?? 1;
  if (row === undefined || level <= MAIN_LOBBY_LEVEL || level >= MAIN_LOBBY_LEVEL + height) {
    return row;
  }
  const lobbyRow = source.row(MAIN_LOBBY_LEVEL) ?? '';
  return [...row]
    .map((cell, column) => (cell === 'l' && lobbyRow[column] === 'l' ? '.' : cell))
    .join('');
}

function lobbyRun(level: Level, run: Run, source: StructureSource): StructurePiece[] {
  if (level === MAIN_LOBBY_LEVEL) {
    const height = source.mainLobbyHeight ?? 1;
    return withColumns(`lobby-${height}`, run, FLOOR_HEIGHT - height * FLOOR_HEIGHT);
  }
  const subject = SKY_LOBBY_LEVELS.includes(level) ? 'sky-lobby' : 'lobby-1';
  return withColumns(subject, run, 0);
}

function withColumns(subject: StructureSubject, run: Run, y: number): StructurePiece[] {
  const pieces: StructurePiece[] = [tiledRun(subject, run, y)];
  for (let column = run.from; column <= run.to; column += 1) {
    if (column % COLUMN_EVERY_TILES === 0) {
      pieces.push({ subject: `${subject}-column`, x: column * TILE_WIDTH, y });
    }
  }
  return pieces;
}

/** A run without the cells that a unit covers; its sprite brings its own floor. */
function bareRun(
  subject: StructureSubject,
  run: { from: number; to: number },
  covered: string | undefined,
): StructurePiece[] {
  if (covered === undefined) {
    return [tiledRun(subject, run)];
  }
  const open: boolean[] = [];
  for (let column = run.from; column <= run.to; column += 1) {
    open.push(covered[column] !== 'u');
  }
  return runsWhere(open).map((piece) =>
    tiledRun(subject, { from: run.from + piece.from, to: run.from + piece.to }),
  );
}

function tiledRun(
  subject: StructureSubject,
  run: { from: number; to: number },
  y = 0,
): StructurePiece {
  return { subject, x: run.from * TILE_WIDTH, y, width: (run.to - run.from + 1) * TILE_WIDTH };
}

/** A parapet sits on every drawn column whose cell above is empty. */
function roofs(level: Level, row: string, source: StructureSource): StructurePiece[] {
  const topLevel = roofLevelAbove(level, row, source);
  const above = source.row(topLevel) ?? '';
  const exposed = [...row].map((cell, column) => isBuilt(cell) && !isBuilt(above[column] ?? '.'));
  const y = (level + 1 - topLevel) * FLOOR_HEIGHT - ROOF_HEIGHT;
  const pieces: StructurePiece[] = [];
  for (const run of runsWhere(exposed)) {
    pieces.push(tiledRun('roof', run, y));
    pieces.push({ subject: 'roof-left', x: run.from * TILE_WIDTH - EDGE_WIDTH, y });
    pieces.push({ subject: 'roof-right', x: (run.to + 1) * TILE_WIDTH, y });
  }
  return pieces;
}

/** The level just above the drawn top of this row; a tall main lobby reaches higher. */
function roofLevelAbove(level: Level, row: string, source: StructureSource): Level {
  if (level === MAIN_LOBBY_LEVEL && row.includes('l')) {
    return MAIN_LOBBY_LEVEL + (source.mainLobbyHeight ?? 1);
  }
  return level + 1;
}

function floorSubject(cell: string): StructureSubject {
  return cell === 'r' ? 'ruins' : 'floor';
}

function isBuilt(cell: string): boolean {
  return cell !== '.';
}

function builtRuns(row: string | undefined): Run[] {
  if (row === undefined) {
    return [];
  }
  const runs: Run[] = [];
  let column = 0;
  while (column < row.length) {
    const cell = row[column] as string;
    let end = column;
    while (row[end + 1] === cell) {
      end += 1;
    }
    if (isBuilt(cell)) {
      runs.push({ cell, from: column, to: end });
    }
    column = end + 1;
  }
  return runs;
}

function runsWhere(flags: readonly boolean[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let start = -1;
  for (let column = 0; column <= flags.length; column += 1) {
    const on = flags[column] === true;
    if (on && start < 0) {
      start = column;
    } else if (!on && start >= 0) {
      runs.push({ from: start, to: column - 1 });
      start = -1;
    }
  }
  return runs;
}
