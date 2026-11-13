import {
  CONDO_HOUSEHOLD_SIZES,
  CONDO_PAIR_CHILD_CHANCE,
  CONDO_TRIO_CHILDREN,
  PERSON_KINDS,
  type PersonPool,
} from '@tower-magnate/shared';

/** Stored code of the child kind. */
export const CHILD_KIND = PERSON_KINDS.indexOf('child');
const RESIDENT_KIND = PERSON_KINDS.indexOf('resident');
const PROSPECT_KIND = PERSON_KINDS.indexOf('prospect');

/** Who lives in a condo: adults and children, at least one adult, at most 3 people in all. */
export interface CondoHousehold {
  adults: number;
  children: number;
}

function mix(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** An independent number in [0, 1) for each (unit, step, trait); it never touches the RNG stream. */
function unitFloat(unitNumber: number, step: number, trait: number): number {
  const hash = mix(mix(unitNumber ^ 0x5bd1e995) + Math.imul(step + 1, 0x9e3779b1) + trait);
  return hash / 0x1_0000_0000;
}

/**
 * Rolls the household of the condo whose buyers are sent at `step`: 1, 2 or 3 people by
 * CONDO_HOUSEHOLD_SIZES. One person is an adult, three are two adults and a child, and two are
 * two adults or, with CONDO_PAIR_CHILD_CHANCE, an adult and a child. Pure: the same unit and step
 * always give the same household, and the simulation RNG is not drawn from.
 */
export function rollCondoHousehold(unitNumber: number, step: number): CondoHousehold {
  const total = CONDO_HOUSEHOLD_SIZES.reduce((sum, weight) => sum + weight, 0);
  let pick = unitFloat(unitNumber, step, 1) * total;
  let size = 1;
  for (let index = 0; index < CONDO_HOUSEHOLD_SIZES.length; index++) {
    pick -= CONDO_HOUSEHOLD_SIZES[index] as number;
    if (pick < 0) {
      size = index + 1;
      break;
    }
  }
  if (size === 1) return { adults: 1, children: 0 };
  if (size === 2) {
    const withChild = unitFloat(unitNumber, step, 2) < CONDO_PAIR_CHILD_CHANCE;
    return withChild ? { adults: 1, children: 1 } : { adults: 2, children: 0 };
  }
  return { adults: size - CONDO_TRIO_CHILDREN, children: CONDO_TRIO_CHILDREN };
}

/** A name seed for a child, derived from the unit and step so no RNG draw is spent. */
export function childNameSeed(unitNumber: number, step: number, index: number): number {
  return mix(mix(unitNumber) ^ Math.imul(step + 1, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35));
}

export function isChild(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === CHILD_KIND;
}

/** Slots of the adults of each home, by home unit, and of each guardian's children. */
export interface HouseholdIndex {
  /** The designated guardian of each home: its adult with the lowest id (the first slot). */
  guardianOfHome: Map<number, number>;
  /** Slots of the children each guardian slot looks after, in increasing id. */
  childrenOfGuardian: Map<number, number[]>;
  /** Children whose home has no adult, who leave with their household. */
  orphans: number[];
}

/**
 * Finds every child's guardian in one pass. The guardian is the adult of the child's home with
 * the lowest person id, a resident or a prospect still walking in; when that adult stays home the
 * child stays home, and when that adult goes out the child goes too.
 */
export function indexHouseholds(pool: PersonPool): HouseholdIndex {
  const guardianOfHome = new Map<number, number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    const kind = pool.kind[slot];
    if (kind !== RESIDENT_KIND && kind !== PROSPECT_KIND) continue;
    const home = pool.homeUnit[slot] as number;
    if (!guardianOfHome.has(home)) guardianOfHome.set(home, slot);
  }
  const childrenOfGuardian = new Map<number, number[]>();
  const orphans: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] !== CHILD_KIND) continue;
    const guardian = guardianOfHome.get(pool.homeUnit[slot] as number);
    if (guardian === undefined) {
      orphans.push(slot);
      continue;
    }
    const list = childrenOfGuardian.get(guardian);
    if (list) list.push(slot);
    else childrenOfGuardian.set(guardian, [slot]);
  }
  return { guardianOfHome, childrenOfGuardian, orphans };
}

/** The guardian slot of a child, or -1 when the home has no adult. */
export function guardianSlotOf(pool: PersonPool, slot: number): number {
  const home = pool.homeUnit[slot] as number;
  for (let candidate = 0; candidate < pool.id.length; candidate++) {
    const kind = pool.kind[candidate];
    if ((kind === RESIDENT_KIND || kind === PROSPECT_KIND) && pool.homeUnit[candidate] === home) {
      return candidate;
    }
  }
  return -1;
}

interface CachedIndex {
  step: number;
  length: number;
  nextId: number;
  index: HouseholdIndex;
}

const cache = new WeakMap<PersonPool, CachedIndex>();

/** `indexHouseholds` kept for the pool of one step; it is rebuilt when anyone is added or removed. */
export function householdIndexOf(pool: PersonPool, step: number): HouseholdIndex {
  const cached = cache.get(pool);
  if (
    cached &&
    cached.step === step &&
    cached.length === pool.id.length &&
    cached.nextId === pool.nextId
  ) {
    return cached.index;
  }
  const index = indexHouseholds(pool);
  cache.set(pool, { step, length: pool.id.length, nextId: pool.nextId, index });
  return index;
}
