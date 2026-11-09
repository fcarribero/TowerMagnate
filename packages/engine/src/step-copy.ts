import type { GridState, TowerState, Unit, UnitId } from '@tower-magnate/shared';
import { clonePersonPool } from './people';

/**
 * The parts of a step's working copy that still belong to the state the step started from.
 * They are the largest parts of a tower and most steps leave them as they are.
 */
interface SharedParts {
  units: Record<UnitId, Unit>;
  grid: GridState;
  tripLedger: TowerState['tripLedger'];
  unitLedger: TowerState['unitLedger'];
}

type SharedKey = keyof SharedParts;

const SHARED_KEYS: ReadonlySet<string> = new Set<SharedKey>([
  'units',
  'grid',
  'tripLedger',
  'unitLedger',
]);

const sharedPartsOf = new WeakMap<TowerState, SharedParts>();

/**
 * A deep copy of plain data: objects, arrays and primitives, which is all a tower holds. Several
 * times faster than structuredClone on the many small objects of a tower.
 */
export function copyPlainData<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(copyPlainData) as T;
  const copy: Record<string, unknown> = {};
  for (const key in value) copy[key] = copyPlainData((value as Record<string, unknown>)[key]);
  return copy as T;
}

function copyOf(key: string, value: unknown): unknown {
  if (SHARED_KEYS.has(key)) return value;
  if (key === 'people') return clonePersonPool(value as TowerState['people']);
  return copyPlainData(value);
}

/**
 * A working copy for one `step` call. Units, the grid and the trip ledgers stay shared with
 * `state` until a system asks for its own copy through the `writable*` functions below; every
 * other part is copied now.
 */
export function stepCopy(state: TowerState): TowerState {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) copy[key] = copyOf(key, value);
  const working = copy as unknown as TowerState;
  sharedPartsOf.set(working, {
    units: state.units,
    grid: state.grid,
    tripLedger: state.tripLedger,
    unitLedger: state.unitLedger,
  });
  return working;
}

/** Ends sharing for a working copy: from now on whoever holds it owns everything it reaches. */
export function endStepCopy(state: TowerState): void {
  sharedPartsOf.delete(state);
}

function copyRecord<T>(record: Record<string, T>): Record<string, T> {
  const copy: Record<string, T> = {};
  for (const key in record) copy[key] = record[key] as T;
  return copy;
}

/** The units record of `state`, safe to add to and delete from. */
export function writableUnits(state: TowerState): Record<UnitId, Unit> {
  const shared = sharedPartsOf.get(state);
  if (shared && state.units === shared.units) state.units = copyRecord(state.units);
  return state.units;
}

/**
 * The unit of `state` with the id of `unit`, safe to change. Callers keep using the returned
 * unit afterwards, since `unit` may still be the shared one.
 */
export function writableUnit<U extends Unit>(state: TowerState, unit: U): U {
  const shared = sharedPartsOf.get(state);
  if (!shared) return unit;
  const units = writableUnits(state);
  const current = units[unit.id] as U | undefined;
  if (!current) throw new Error(`Unit ${unit.id} is not in the tower`);
  if (current !== shared.units[unit.id]) return current;
  const copy = copyPlainData(current);
  units[unit.id] = copy;
  return copy;
}

export function writableGrid(state: TowerState): GridState {
  const shared = sharedPartsOf.get(state);
  if (shared && state.grid === shared.grid) state.grid = copyPlainData(state.grid);
  return state.grid;
}

/** The trip ledger of `state`, safe to set and delete entries in; the entries are never changed. */
export function writableTripLedger(state: TowerState): TowerState['tripLedger'] {
  const shared = sharedPartsOf.get(state);
  if (shared && state.tripLedger === shared.tripLedger) {
    state.tripLedger = copyRecord(state.tripLedger);
  }
  return state.tripLedger;
}

/** The unit ledger of `state`, safe to set and delete entries in; the entries are never changed. */
export function writableUnitLedger(state: TowerState): TowerState['unitLedger'] {
  const shared = sharedPartsOf.get(state);
  if (shared && state.unitLedger === shared.unitLedger) {
    state.unitLedger = copyRecord(state.unitLedger);
  }
  return state.unitLedger;
}
