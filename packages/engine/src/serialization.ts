import type { TowerState } from '@tower-magnate/shared';
import { migrateState, StateMigrationError } from './migrations';

/** Turns the full tower state into the JSON text the server stores. */
export function serializeState(state: TowerState): string {
  return JSON.stringify(state);
}

/**
 * Reads stored JSON text back into a tower state of the current schema version,
 * running any migrations on the way. Throws `StateMigrationError` for anything it cannot load.
 */
export function deserializeState(text: string): TowerState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StateMigrationError('Saved state is not valid JSON');
  }
  return migrateState(raw);
}
