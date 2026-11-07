import type { ErrorCode } from './errors';
import type { Level } from './levels';
import type { UnitType } from './units';

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
  units: Record<UnitId, Unit>;
}

export type Command =
  | { type: 'buildFloor'; level: Level; x0: number; x1: number }
  | { type: 'buildLobby'; level: Level; x0: number; x1: number; height: 1 | 2 | 3 }
  | { type: 'renameUnit'; unitId: UnitId; name: string };

export type CommandType = Command['type'];

export interface QueuedCommand {
  id: string;
  command: Command;
}

export type CommandResult =
  | { id: string; ok: true; step: number; cost: number; refund: number }
  | { id: string; ok: false; step: number; error: ErrorCode };

/** Events caused by a player command carry that command's id. */
export type EngineEvent = {
  type: 'unitRenamed';
  step: number;
  commandId: string;
  unitId: UnitId;
  name: string | null;
};
