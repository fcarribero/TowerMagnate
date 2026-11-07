import {
  isColumn,
  isLevel,
  TOWER_LAYOUT,
  type ColumnSpan,
  type GridState,
  type LevelRow,
  type LobbyHeight,
  type OccupantRef,
  type OccupantSpan,
  type StructureSpan,
} from '@tower-magnate/shared';
import { createGrid } from '../grid';
import { isRecord, StateMigrationError } from './errors';

const STRUCTURE_KINDS: readonly unknown[] = ['floor', 'lobby'];
const TRANSPORT_PARTS: readonly unknown[] = ['footprint', 'landing'];
const SKY_LOBBY_FLOORS: readonly number[] = TOWER_LAYOUT.skyLobbyFloors;

/** Towers saved before the grid existed have no `grid`; they start with an empty one. */
export function readGrid(raw: unknown): GridState {
  if (raw === undefined) {
    return createGrid();
  }
  if (!isRecord(raw)) {
    throw new StateMigrationError('State grid must be an object');
  }
  return {
    levels: readLevels(raw.levels),
    mainLobbyHeight: readMainLobbyHeight(raw.mainLobbyHeight),
    skyLobbyHeights: readSkyLobbyHeights(raw.skyLobbyHeights),
  };
}

function readLevels(raw: unknown): GridState['levels'] {
  if (!isRecord(raw)) {
    throw new StateMigrationError('Grid levels must be a record');
  }
  const levels: GridState['levels'] = {};
  for (const [key, value] of Object.entries(raw)) {
    const level = Number(key);
    if (!isLevel(level)) {
      throw new StateMigrationError(`Grid level ${key} is not a level`);
    }
    const row = readRow(level, value);
    if (row.structure.length > 0 || row.occupants.length > 0) {
      levels[level] = row;
    }
  }
  return levels;
}

function readRow(level: number, raw: unknown): LevelRow {
  if (!isRecord(raw) || !Array.isArray(raw.structure) || !Array.isArray(raw.occupants)) {
    throw new StateMigrationError(`Grid row ${level} must hold structure and occupants lists`);
  }
  const structure = raw.structure.map((span) => readStructureSpan(level, span));
  const occupants = raw.occupants.map((span) => readOccupantSpan(level, span));
  assertSortedAndDisjoint(level, structure);
  assertSortedAndDisjoint(level, occupants);
  assertMerged(level, structure);
  return { structure, occupants };
}

function readColumns(level: number, raw: Record<string, unknown>): ColumnSpan {
  const { x0, x1 } = raw;
  if (!isColumn(x0) || !isColumn(x1) || x0 > x1) {
    throw new StateMigrationError(`Grid row ${level} has a span outside the columns`);
  }
  return { x0, x1 };
}

function readStructureSpan(level: number, raw: unknown): StructureSpan {
  if (!isRecord(raw) || !STRUCTURE_KINDS.includes(raw.kind)) {
    throw new StateMigrationError(`Grid row ${level} has an unknown structure span`);
  }
  return { kind: raw.kind as StructureSpan['kind'], ...readColumns(level, raw) };
}

function readOccupantSpan(level: number, raw: unknown): OccupantSpan {
  if (!isRecord(raw)) {
    throw new StateMigrationError(`Grid row ${level} has a malformed occupant span`);
  }
  return { ...readColumns(level, raw), occupant: readOccupant(level, raw.occupant) };
}

function readOccupant(level: number, raw: unknown): OccupantRef {
  if (isRecord(raw)) {
    const { kind, id, part } = raw;
    if (kind === 'ruins') return { kind };
    if (typeof id === 'string' && id !== '') {
      if (kind === 'unit' || kind === 'shaft') return { kind, id };
      if (kind === 'transport' && TRANSPORT_PARTS.includes(part)) {
        return { kind, id, part: part as 'footprint' | 'landing' };
      }
    }
  }
  throw new StateMigrationError(`Grid row ${level} has an unknown occupant`);
}

function assertSortedAndDisjoint(level: number, spans: readonly ColumnSpan[]): void {
  let previous: ColumnSpan | undefined;
  for (const span of spans) {
    if (previous && span.x0 <= previous.x1) {
      throw new StateMigrationError(`Grid row ${level} has unsorted or overlapping spans`);
    }
    previous = span;
  }
}

function assertMerged(level: number, spans: readonly StructureSpan[]): void {
  let previous: StructureSpan | undefined;
  for (const span of spans) {
    if (previous && previous.kind === span.kind && previous.x1 + 1 === span.x0) {
      throw new StateMigrationError(`Grid row ${level} has adjacent structure spans not merged`);
    }
    previous = span;
  }
}

function isLobbyHeight(value: unknown): value is LobbyHeight {
  return value === 1 || value === 2 || value === 3;
}

function readMainLobbyHeight(raw: unknown): LobbyHeight | null {
  if (raw === null || isLobbyHeight(raw)) return raw;
  throw new StateMigrationError('Grid main lobby height must be 1, 2, 3 or null');
}

function readSkyLobbyHeights(raw: unknown): GridState['skyLobbyHeights'] {
  if (!isRecord(raw)) {
    throw new StateMigrationError('Grid sky lobby heights must be a record');
  }
  const heights: GridState['skyLobbyHeights'] = {};
  for (const [key, value] of Object.entries(raw)) {
    const level = Number(key);
    if (!SKY_LOBBY_FLOORS.includes(level) || !isLobbyHeight(value)) {
      throw new StateMigrationError(`Grid sky lobby ${key} is not a sky lobby floor with a height`);
    }
    heights[level] = value;
  }
  return heights;
}
