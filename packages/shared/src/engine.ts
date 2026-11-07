import type { Level } from './levels';

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

export interface TowerState {
  schemaVersion: number;
  step: number;
  rng: RngState;
  nextId: number;
  grid: GridState;
}

export type Command =
  | { type: 'buildFloor'; level: Level; x0: number; x1: number }
  | { type: 'buildLobby'; level: Level; x0: number; x1: number; height: LobbyHeight };

export interface QueuedCommand {
  id: string;
  command: Command;
}

export type CommandResult =
  | { id: string; ok: true; step: number; cost: number; refund: number }
  | { id: string; ok: false; step: number; error: ErrorCode };

export type EngineEvent = never;

export type ErrorCode =
  | 'INVALID_COMMAND'
  | 'NEGATIVE_BALANCE'
  | 'INSUFFICIENT_FUNDS'
  | 'STAR_LOCKED'
  | 'BOMB_EVENT_ACTIVE'
  | 'LIMIT_REACHED'
  | 'CAR_LIMIT'
  | 'LAST_CAR'
  | 'OUT_OF_BOUNDS'
  | 'LEVEL_RESERVED'
  | 'LOBBY_LEVEL_ONLY'
  | 'LOBBY_FLOOR_NOT_ALLOWED'
  | 'ABOVE_GROUND_ONLY'
  | 'BASEMENT_ONLY'
  | 'CATHEDRAL_LEVEL_ONLY'
  | 'CATHEDRAL_POSITION'
  | 'SUBWAY_POSITION'
  | 'SPANS_GROUND'
  | 'EXPRESS_STOP_NOT_ALLOWED'
  | 'CELL_OCCUPIED'
  | 'NOTHING_TO_BUILD'
  | 'NO_SUPPORT'
  | 'NO_FLOOR'
  | 'TRANSPORT_LANDING'
  | 'LOBBY_HEIGHT_MISMATCH'
  | 'LOBBY_NOT_CONTIGUOUS'
  | 'ESCALATOR_FLOOR_TYPE'
  | 'SHAFT_TOO_TALL'
  | 'SHAFT_TOO_CLOSE'
  | 'RAMP_POSITION'
  | 'PARKING_NOT_CONNECTED'
  | 'RECYCLING_NOT_ADJACENT'
  | 'MAIN_LOBBY_PROTECTED'
  | 'SUPPORTS_STRUCTURE'
  | 'SHAFT_IN_USE'
  | 'NOTHING_TO_DEMOLISH'
  | 'UNKNOWN_ENTITY'
  | 'PRICE_LOCKED'
  | 'NOT_A_CINEMA'
  | 'EVENT_EXPIRED'
  | 'INVALID_CHOICE'
  | 'FOLLOW_LIMIT'
  | 'INVALID_SCHEDULE';
