import type { ErrorCode } from './errors';
import type { Ledger } from './ledger';
import type { Level } from './levels';
import type { UnitType } from './units';

/** Id of a placed unit, transport or shaft, with a type prefix: `u12`, `t3`, `s4`. */
export type EntityId = string;

export type StructureKind = 'floor' | 'lobby';

/** A run of cells on one level, from column x0 to x1 inclusive. */
export interface ColumnSpan {
  x0: number;
  x1: number;
}

export interface StructureSpan extends ColumnSpan {
  kind: StructureKind;
}

export type OccupantRef =
  | { kind: 'unit'; id: EntityId }
  | { kind: 'transport'; id: EntityId; part: 'footprint' | 'landing' }
  | { kind: 'shaft'; id: EntityId }
  | { kind: 'ruins' };

export interface OccupantSpan extends ColumnSpan {
  occupant: OccupantRef;
}

export interface LevelRow {
  /** Sorted by x0, never overlapping, adjacent spans of the same kind merged. */
  structure: StructureSpan[];
  /** Sorted by x0, never overlapping. */
  occupants: OccupantSpan[];
}

export type LobbyHeight = 1 | 2 | 3;

export interface GridState {
  /** Only levels that hold structure or occupants have a row. */
  levels: Partial<Record<Level, LevelRow>>;
  /** Set by the first lobby built on level 1; null until then. */
  mainLobbyHeight: LobbyHeight | null;
  /** Keyed by sky lobby floor (15, 30, ... 90), set by the first lobby built there. */
  skyLobbyHeights: Partial<Record<Level, LobbyHeight>>;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Instance id of a placed unit, such as `u12`. The catalog type is `UnitType`. */
export type UnitId = string;

export interface Unit {
  id: UnitId;
  type: UnitType;
  /** Leftmost column. */
  x: number;
  /** Bottom level. */
  level: Level;
  /** Player-chosen name; null shows the default name. */
  name: string | null;
}

export interface TowerState {
  schemaVersion: number;
  step: number;
  rng: RngState;
  nextId: number;
  /** Whole dollars, may be negative, never above MONEY_CAP. */
  money: number;
  units: Record<UnitId, Unit>;
  grid: GridState;
  ledger: Ledger;
}

/** Events caused by a player command carry that command's id. */
export type EngineEvent = {
  type: 'unitRenamed';
  step: number;
  commandId: string;
  unitId: UnitId;
  name: string | null;
};
