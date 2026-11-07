import type { TowerState } from '@tower-magnate/shared';
import { createGrid } from './grid';
import { clonePersonPool, createPersonPool } from './people';
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
    units: {},
    grid: createGrid(),
    people: createPersonPool(),
  };
}

/** A deep copy of the tower that a step or command can change freely. */
export function cloneState(state: TowerState): TowerState {
  const { people, ...rest } = state;
  return { ...structuredClone(rest), people: clonePersonPool(people) };
}
