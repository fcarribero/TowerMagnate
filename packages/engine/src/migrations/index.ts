import type { RngState, TowerState } from '@tower-magnate/shared';
import { SCHEMA_VERSION } from '../state';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns a version n+1 state into version n+2. */
const MIGRATIONS: readonly Migration[] = [];

export class StateMigrationError extends Error {
  override name = 'StateMigrationError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
  };
}

export function migrateState(raw: unknown): TowerState {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State must be an object');
  }
  const version = raw.schemaVersion;
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
