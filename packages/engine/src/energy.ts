import {
  ENERGY_HOME_RESTORE,
  ENERGY_RESIDENT_EXIT_LOSS,
  ENERGY_UNIT,
  ENERGY_WORKER_IDLE_DRAIN,
  MAX_ENERGY_LEVEL,
  MIN_ENERGY_LEVEL,
  PERSON_KINDS,
  type PersonKind,
  type PersonPool,
} from '@tower-magnate/shared';

export const MIN_ENERGY = MIN_ENERGY_LEVEL * ENERGY_UNIT;
export const MAX_ENERGY = MAX_ENERGY_LEVEL * ENERGY_UNIT;

/** Spread of the logistic curve that turns a draw into an energy level. */
const ENERGY_SPREAD = 1.1;
const ENERGY_CENTRE = 5.5;
const SEED_RANGE = 2 ** 32;

/**
 * The energy level a person is born with, from the one draw that also picks their name. The log
 * odds of a uniform draw follow a logistic curve, so levels 5 and 6 are far more likely than 1
 * or 10 (about 22% each against 3%).
 */
export function baseEnergy(nameSeed: number): number {
  const u = ((nameSeed >>> 0) + 0.5) / SEED_RANGE;
  const level = Math.round(ENERGY_CENTRE + ENERGY_SPREAD * Math.log(u / (1 - u)));
  return Math.min(MAX_ENERGY_LEVEL, Math.max(MIN_ENERGY_LEVEL, level)) * ENERGY_UNIT;
}

export function startingEnergy(_kind: PersonKind, nameSeed: number): number {
  return baseEnergy(nameSeed);
}

/** The whole level 1 to 10 the route choice sees. */
export function energyLevelOf(pool: PersonPool, slot: number): number {
  const energy = pool.energy[slot] as number;
  return Math.min(MAX_ENERGY_LEVEL, Math.max(MIN_ENERGY_LEVEL, Math.round(energy / ENERGY_UNIT)));
}

export function drainEnergy(pool: PersonPool, slot: number, amount: number): void {
  pool.energy[slot] = Math.max(MIN_ENERGY, (pool.energy[slot] as number) - amount);
}

const WORKER_KINDS = new Set<number>(
  (['officeWorker', 'staff', 'maid', 'guard', 'builder'] as const).map((kind) =>
    PERSON_KINDS.indexOf(kind),
  ),
);
const RESTING_KINDS = new Set<number>(
  (['resident', 'hotelGuest'] as const).map((kind) => PERSON_KINDS.indexOf(kind)),
);
const RESIDENT = PERSON_KINDS.indexOf('resident');

/**
 * One step of a person who is not on a trip, so inside a unit. Workers keep losing energy with
 * the work; residents and guests get it back quickly, up to their own level.
 */
export function restEnergy(pool: PersonPool, slot: number): void {
  const kind = pool.kind[slot] as number;
  if (WORKER_KINDS.has(kind)) {
    drainEnergy(pool, slot, ENERGY_WORKER_IDLE_DRAIN);
  } else if (RESTING_KINDS.has(kind)) {
    const own = baseEnergy(pool.nameSeed[slot] as number);
    const energy = pool.energy[slot] as number;
    if (energy < own) pool.energy[slot] = Math.min(own, energy + ENERGY_HOME_RESTORE);
  }
}

/** A rested resident steps out of the condo with less energy than their own level. */
export function leaveHome(pool: PersonPool, slot: number): void {
  if (pool.kind[slot] !== RESIDENT) return;
  const own = baseEnergy(pool.nameSeed[slot] as number);
  if ((pool.energy[slot] as number) >= own) {
    pool.energy[slot] = Math.max(MIN_ENERGY, own - ENERGY_RESIDENT_EXIT_LOSS * ENERGY_UNIT);
  }
}

/** The 03:00 reset: everybody starts the day with their own level. */
export function resetEnergy(pool: PersonPool): void {
  for (let slot = 0; slot < pool.id.length; slot++) {
    pool.energy[slot] = baseEnergy(pool.nameSeed[slot] as number);
  }
}
