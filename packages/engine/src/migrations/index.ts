import {
  isLevel,
  UNIT_TYPES,
  type RngState,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { SCHEMA_VERSION } from '../state';
import { isRecord, StateMigrationError } from './errors';
import { readGrid } from './grid';
import { readPeople } from './people';

export { StateMigrationError } from './errors';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns a version n+1 state into version n+2. */
const MIGRATIONS: readonly Migration[] = [];

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRngState(value: unknown): value is RngState {
  return (
    isRecord(value) &&
    isUint32(value.a) &&
    isUint32(value.b) &&
    isUint32(value.c) &&
    isUint32(value.d)
  );
}

function isUnit(value: unknown): value is Unit {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (UNIT_TYPES as readonly unknown[]).includes(value.type) &&
    isNonNegativeInteger(value.x) &&
    isLevel(value.level) &&
    (value.name === null || typeof value.name === 'string')
  );
}

/** Towers saved before units existed have no `units` record; they start with none. */
function readUnits(raw: unknown): Record<UnitId, Unit> {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new StateMigrationError('State units must be a record');
  }
  const units: Record<UnitId, Unit> = {};
  for (const [id, unit] of Object.entries(raw)) {
    if (!isUnit(unit) || unit.id !== id) {
      throw new StateMigrationError(`State unit ${id} is malformed`);
    }
    units[id] = { id: unit.id, type: unit.type, x: unit.x, level: unit.level, name: unit.name };
  }
  return units;
}

function assertCurrentShape(raw: Record<string, unknown>): TowerState {
  if (!isNonNegativeInteger(raw.step)) {
    throw new StateMigrationError('State step must be a non-negative integer');
  }
  if (!isRngState(raw.rng)) {
    throw new StateMigrationError('State rng must hold four unsigned 32-bit words');
  }
  if (!isNonNegativeInteger(raw.nextId)) {
    throw new StateMigrationError('State nextId must be a non-negative integer');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    step: raw.step,
    rng: { a: raw.rng.a, b: raw.rng.b, c: raw.rng.c, d: raw.rng.d },
    nextId: raw.nextId,
    units: readUnits(raw.units),
    grid: readGrid(raw.grid),
    people: readPeople(raw.people),
  };
}

export function migrateState(raw: unknown): TowerState {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State must be an object');
  }
  const version = raw.schemaVersion;
  if (version === undefined) {
    throw new StateMigrationError('State has no schema version');
  }
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new StateMigrationError(`Unknown schema version ${String(version)}`);
  }
  if ((version as number) > SCHEMA_VERSION) {
    throw new StateMigrationError(
      `State schema version ${String(version)} is newer than this engine (${SCHEMA_VERSION})`,
    );
  }
  let migrated = raw;
  for (let from = version as number; from < SCHEMA_VERSION; from++) {
    const migration = MIGRATIONS[from - 1];
    if (!migration) {
      throw new StateMigrationError(`No migration from schema version ${from}`);
    }
    migrated = migration(migrated);
  }
  return assertCurrentShape(migrated);
}
