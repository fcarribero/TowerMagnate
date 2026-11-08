import {
  MAX_FOLLOWED_PEOPLE,
  PERSON_KINDS,
  UNIT_CATALOG,
  type CapacityRole,
  type EntityId,
  type ErrorCode,
  type Level,
  type PersonKind,
  type PersonPool,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { leaveQueues } from './elevator-queues';
import { stressBand, type StressBand } from './person-stress';
import { nextInt, nextUint32 } from './rng';
import type { SimulationSystem, StepContext } from './step';

export const NOTHING_DUE = -1;
export const NO_TRIP = 0;
export const NO_HOME_UNIT = 0;

/** The kind of the people a unit holds for as long as it exists or is let (people spec 2). */
const KIND_BY_CAPACITY_ROLE: Partial<Record<CapacityRole, PersonKind>> = {
  'office-workers': 'officeWorker',
  residents: 'resident',
  'hotel-guests': 'hotelGuest',
  maids: 'maid',
  guards: 'guard',
};

export interface NewPerson {
  kind: PersonKind;
  homeUnit: number;
  level: Level;
  column: number;
}

/** A read-only view of one person, for tests, inspection and the client. */
export interface PersonView {
  id: EntityId;
  kind: PersonKind;
  homeUnit: UnitId | null;
  level: Level;
  column: number;
  trip: number;
  dueStep: number;
  stress: number;
  stressBand: StressBand;
  nameSeed: number;
  followed: boolean;
}

export function createPersonPool(): PersonPool {
  return {
    nextId: 1,
    id: [],
    kind: [],
    homeUnit: [],
    level: [],
    column: [],
    trip: [],
    dueStep: [],
    stress: [],
    nameSeed: [],
    followed: [],
  };
}

/** A deep copy, much faster than structuredClone for pools of thousands of people. */
export function clonePersonPool(pool: PersonPool): PersonPool {
  return {
    nextId: pool.nextId,
    id: pool.id.slice(),
    kind: pool.kind.slice(),
    homeUnit: pool.homeUnit.slice(),
    level: pool.level.slice(),
    column: pool.column.slice(),
    trip: pool.trip.slice(),
    dueStep: pool.dueStep.slice(),
    stress: pool.stress.slice(),
    nameSeed: pool.nameSeed.slice(),
    followed: pool.followed.slice(),
  };
}

export function peopleCount(pool: PersonPool): number {
  return pool.id.length;
}

export function personEntityId(id: number): EntityId {
  return `p${id}`;
}

/** `p12` gives 12; anything that is not a person id gives null. */
export function parsePersonId(entityId: unknown): number | null {
  return parseEntityNumber(entityId, 'p');
}

/** `u7` gives 7; anything that is not a unit id gives null. */
export function parseUnitNumber(unitId: unknown): number | null {
  return parseEntityNumber(unitId, 'u');
}

function parseEntityNumber(entityId: unknown, prefix: string): number | null {
  if (typeof entityId !== 'string' || !entityId.startsWith(prefix)) return null;
  const digits = entityId.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Adds a person at the end of the pool and returns their id. The column is used as given;
 * the name seed is the person's one RNG draw.
 */
export function addPerson(state: TowerState, person: NewPerson): number {
  const pool = state.people;
  const id = pool.nextId;
  pool.id.push(id);
  pool.kind.push(PERSON_KINDS.indexOf(person.kind));
  pool.homeUnit.push(person.homeUnit);
  pool.level.push(person.level);
  pool.column.push(person.column);
  pool.trip.push(NO_TRIP);
  pool.dueStep.push(NOTHING_DUE);
  pool.stress.push(0);
  pool.nameSeed.push(nextUint32(state.rng));
  pool.nextId += 1;
  return id;
}

/** The kind and number of people a unit of this type holds, or null if it holds none. */
export function unitPeople(unitType: UnitType): {
  kind: PersonKind;
  count: number;
} | null {
  const capacity = UNIT_CATALOG[unitType].capacity;
  if (!capacity || capacity.people === null) return null;
  const kind = KIND_BY_CAPACITY_ROLE[capacity.role];
  if (!kind) return null;
  return { kind, count: capacity.people };
}

/**
 * Creates the people a unit holds, with the catalog count for its type (P-03): office
 * workers when an office gets a tenant, residents when a condo is sold, a hotel party when a
 * stay starts, maids and guards when their unit is built. Each person draws a column inside
 * the unit, then a name seed. Returns the new person ids in creation order.
 */
export function addPeopleForUnit(state: TowerState, unitId: UnitId): EntityId[] {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  const homeUnit = parseUnitNumber(unitId);
  if (!unit || homeUnit === null) {
    throw new Error(`Unit ${unitId} does not exist`);
  }
  const people = unitPeople(unit.type);
  if (!people) {
    throw new Error(`Units of type ${unit.type} hold no people of their own`);
  }
  const width = UNIT_CATALOG[unit.type].width;
  const created: EntityId[] = [];
  for (let index = 0; index < people.count; index++) {
    const column = unit.x + nextInt(state.rng, 0, width - 1);
    const id = addPerson(state, { kind: people.kind, homeUnit, level: unit.level, column });
    created.push(personEntityId(id));
  }
  return created;
}

/**
 * Removes every person who belongs to the unit, wherever they are (people spec 4.2), and
 * returns their ids. Call it when the tenant leaves, the condo sale is reversed, the stay
 * ends or the unit is demolished.
 */
export function removePeopleOfUnit(state: TowerState, unitId: UnitId): EntityId[] {
  const homeUnit = parseUnitNumber(unitId);
  if (homeUnit === null) return [];
  const removed = removePeopleWhere(state.people, (pool, slot) => pool.homeUnit[slot] === homeUnit);
  leaveQueues(state, removed);
  return removed;
}

/** Removes one person; returns false if there was no such person. */
export function removePerson(state: TowerState, personId: number): boolean {
  if (slotOfPerson(state.people, personId) < 0) return false;
  const removed = removePeopleWhere(state.people, (pool, slot) => pool.id[slot] === personId);
  leaveQueues(state, removed);
  return true;
}

/** Keeps the pool dense and in id order by sliding the kept people down over the removed ones. */
function removePeopleWhere(
  pool: PersonPool,
  shouldRemove: (pool: PersonPool, slot: number) => boolean,
): EntityId[] {
  const removed: number[] = [];
  const count = peopleCount(pool);
  let kept = 0;
  for (let slot = 0; slot < count; slot++) {
    if (shouldRemove(pool, slot)) {
      removed.push(readSlot(pool.id, slot));
    } else {
      if (kept !== slot) copySlot(pool, slot, kept);
      kept += 1;
    }
  }
  for (const array of poolArrays(pool)) array.length = kept;
  if (removed.length > 0) {
    const removedIds = new Set(removed);
    pool.followed = pool.followed.filter((id) => !removedIds.has(id));
  }
  return removed.map(personEntityId);
}

/** The slot of the person with this id, or -1. Binary search: slots are sorted by id. */
export function slotOfPerson(pool: PersonPool, personId: number): number {
  let low = 0;
  let high = peopleCount(pool) - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const middleId = readSlot(pool.id, middle);
    if (middleId === personId) return middle;
    if (middleId < personId) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

/** The first slot whose person id is greater than `personId`. */
function firstSlotAfter(pool: PersonPool, personId: number): number {
  let low = 0;
  let high = peopleCount(pool);
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (readSlot(pool.id, middle) <= personId) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function personAt(pool: PersonPool, slot: number): PersonView {
  if (slot < 0 || slot >= peopleCount(pool)) {
    throw new RangeError(`Slot ${slot} is not in use`);
  }
  const id = readSlot(pool.id, slot);
  const homeUnit = readSlot(pool.homeUnit, slot);
  const kind = PERSON_KINDS[readSlot(pool.kind, slot)];
  if (!kind) throw new Error(`Slot ${slot} has an unknown person kind`);
  return {
    id: personEntityId(id),
    kind,
    homeUnit: homeUnit === NO_HOME_UNIT ? null : `u${homeUnit}`,
    level: readSlot(pool.level, slot),
    column: readSlot(pool.column, slot),
    trip: readSlot(pool.trip, slot),
    dueStep: readSlot(pool.dueStep, slot),
    stress: readSlot(pool.stress, slot),
    stressBand: stressBand(readSlot(pool.stress, slot)),
    nameSeed: readSlot(pool.nameSeed, slot),
    followed: pool.followed.includes(id),
  };
}

export function findPerson(pool: PersonPool, personId: number): PersonView | null {
  const slot = slotOfPerson(pool, personId);
  return slot < 0 ? null : personAt(pool, slot);
}

/** Every person in the pool, in increasing id. */
export function listPeople(pool: PersonPool): PersonView[] {
  const people: PersonView[] = [];
  for (let slot = 0; slot < peopleCount(pool); slot++) people.push(personAt(pool, slot));
  return people;
}

/** How many people of each kind are in the pool. Kinds with nobody are left out. */
export function countPeopleByKind(pool: PersonPool): Partial<Record<PersonKind, number>> {
  const counts: Partial<Record<PersonKind, number>> = {};
  for (let slot = 0; slot < peopleCount(pool); slot++) {
    const kind = PERSON_KINDS[readSlot(pool.kind, slot)];
    if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function setDueStep(pool: PersonPool, personId: number, step: number): void {
  const slot = slotOfPerson(pool, personId);
  if (slot < 0) throw new Error(`Person ${personEntityId(personId)} does not exist`);
  pool.dueStep[slot] = step;
}

/** Follows a person; following someone already followed changes nothing. */
export function followPerson(pool: PersonPool, personId: number): ErrorCode | null {
  if (slotOfPerson(pool, personId) < 0) return 'UNKNOWN_ENTITY';
  if (pool.followed.includes(personId)) return null;
  if (pool.followed.length >= MAX_FOLLOWED_PEOPLE) return 'FOLLOW_LIMIT';
  pool.followed.push(personId);
  pool.followed.sort((a, b) => a - b);
  return null;
}

export function unfollowPerson(pool: PersonPool, personId: number): ErrorCode | null {
  if (slotOfPerson(pool, personId) < 0) return 'UNKNOWN_ENTITY';
  pool.followed = pool.followed.filter((id) => id !== personId);
  return null;
}

/** Called for a person whose due step has come, with the slot they are in right now. */
export type PersonHandler = (context: StepContext, slot: number) => void;

/**
 * A step system that hands every person whose due step is the current step to `handle`, in
 * increasing person id (people spec 1.2). The handler may add or remove people: people it
 * adds come after everyone else and are handled in the same pass if they are due.
 */
export function createPeopleSystem(handle: PersonHandler): SimulationSystem {
  return (context) => {
    const currentStep = context.state.step;
    const pool = context.state.people;
    let slot = 0;
    while (slot < pool.dueStep.length) {
      if (pool.dueStep[slot] !== currentStep) {
        slot += 1;
        continue;
      }
      const personId = readSlot(pool.id, slot);
      handle(context, slot);
      slot = firstSlotAfter(pool, personId);
    }
  };
}

function poolArrays(pool: PersonPool): number[][] {
  return [
    pool.id,
    pool.kind,
    pool.homeUnit,
    pool.level,
    pool.column,
    pool.trip,
    pool.dueStep,
    pool.stress,
    pool.nameSeed,
  ];
}

function copySlot(pool: PersonPool, from: number, to: number): void {
  for (const array of poolArrays(pool)) array[to] = readSlot(array, from);
}

function readSlot(array: readonly number[], slot: number): number {
  const value = array[slot];
  if (value === undefined) throw new RangeError(`Slot ${slot} is outside the pool`);
  return value;
}
