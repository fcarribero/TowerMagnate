import type { PersonPool } from '@tower-magnate/shared';
import { createPersonPool } from '../people';
import { isRecord, StateMigrationError } from './errors';

/** Saves from before people existed, and saves with nobody in them, load with an empty pool. */
export function readPeople(raw: unknown): PersonPool {
  if (raw === undefined) return createPersonPool();
  if (!isRecord(raw) || !Array.isArray(raw.id)) {
    throw new StateMigrationError('State people must be a person pool');
  }
  if (raw.id.length > 0) {
    throw new StateMigrationError('Loading a saved tower with people is not supported yet');
  }
  return createPersonPool();
}
