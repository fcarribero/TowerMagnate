import type { TowerState } from '@tower-magnate/shared';
import { createRng } from './rng';

export const SCHEMA_VERSION = 1;

export function createTower(seed: number): TowerState {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`Tower seed must be an integer, got ${seed}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    step: 0,
    rng: createRng(seed),
    nextId: 1,
  };
}
