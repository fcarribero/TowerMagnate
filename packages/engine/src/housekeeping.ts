import {
  CHANGE_CLOTHES_STEPS,
  CLEANING_MINUTES,
  CLEANING_START_BEFORE_MINUTE,
  CLEANING_START_FROM_MINUTE,
  MAID_APPEAR_MINUTE,
  MAID_LEAVE_MINUTE,
  MAID_RETRY_MINUTES,
  PERSON_KINDS,
  UNIT_CATALOG,
  type PersonPool,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { finishCleaning } from './hotel';
import { addPerson, NO_TRIP, NOTHING_DUE, removePerson } from './people';
import { entrancePlace } from './office-routine';
import { chance } from './rng';
import { nearestStreetColumn, streetColumn, streetPlace } from './street';
import { floorIndex } from './routing/transport-graph';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { cancelTrek, isOnTrek, startTrek, trekPhaseAt, type TrekPlace } from './trek';
import { isHotelRoomType, unitNumber } from './units';

const MAID_KIND = PERSON_KINDS.indexOf('maid');
const CLEANING_STEPS = CLEANING_MINUTES * STEPS_PER_MINUTE;
const RETRY_STEPS = MAID_RETRY_MINUTES * STEPS_PER_MINUTE;
const ASK_FROM_STEP = CLEANING_START_FROM_MINUTE * STEPS_PER_MINUTE;
const ASK_BEFORE_STEP = CLEANING_START_BEFORE_MINUTE * STEPS_PER_MINUTE;
const APPEAR_STEP = MAID_APPEAR_MINUTE * STEPS_PER_MINUTE;
const LEAVE_STEP = MAID_LEAVE_MINUTE * STEPS_PER_MINUTE;

/**
 * What a maid is doing (hotel spec 4 and 5). `waiting` has no claim and may ask for a room;
 * `finished` is only found in old saves, where it meant the daily limit; she asks again. She walks in from the
 * street in civilian clothes (`arriving`), changes in her room (`changingIn`), works in uniform,
 * changes back (`changingOut`) and walks out (`leaving`). Phases are stored by their index, so the
 * first four keep the numbers they always had.
 */
export type MaidPhase =
  | 'waiting'
  | 'toRoom'
  | 'cleaning'
  | 'finished'
  | 'arriving'
  | 'changingIn'
  | 'changingOut'
  | 'leaving';

const PHASES: readonly MaidPhase[] = [
  'waiting',
  'toRoom',
  'cleaning',
  'finished',
  'arriving',
  'changingIn',
  'changingOut',
  'leaving',
];
const PHASE_RANGE = PHASES.length;
/** Room for the cleanings counter in a stored task: a maid fits far fewer starts than this in a shift. */
const CLEANINGS_RANGE = 48;

/** True while the maid wears her uniform: from the end of changing in to the end of changing out. */
export function maidWearsUniform(task: MaidTask | null): boolean {
  if (task === null) return false;
  return (
    task.phase === 'waiting' ||
    task.phase === 'toRoom' ||
    task.phase === 'cleaning' ||
    task.phase === 'finished' ||
    task.phase === 'changingOut'
  );
}

/** A maid's task, kept in the person's `trip` number. */
export interface MaidTask {
  phase: MaidPhase;
  /** Unit number of the claimed room, or 0 with no claim. */
  room: number;
  /** Cleanings started today. */
  cleanings: number;
}

type RoomUnit = Unit & { hotel: NonNullable<Unit['hotel']> };

/** Packs the task into a positive integer, so a maid's trip is never NO_TRIP. */
export function encodeMaidTask(task: MaidTask): number {
  const packed = task.room * CLEANINGS_RANGE + task.cleanings;
  return packed * PHASE_RANGE + PHASES.indexOf(task.phase) + 1;
}

export function decodeMaidTask(trip: number): MaidTask | null {
  if (trip === NO_TRIP) return null;
  const phase = PHASES[(trip - 1) % PHASE_RANGE];
  if (!phase) return null;
  const packed = Math.floor((trip - 1) / PHASE_RANGE);
  return { phase, room: Math.floor(packed / CLEANINGS_RANGE), cleanings: packed % CLEANINGS_RANGE };
}

export function isMaid(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === MAID_KIND;
}

export function maidTaskAt(pool: PersonPool, slot: number): MaidTask | null {
  if (!isMaid(pool, slot)) return null;
  return decodeMaidTask(pool.trip[slot] ?? NO_TRIP);
}

function holdsClaim(task: MaidTask | null): task is MaidTask {
  return task !== null && (task.phase === 'toRoom' || task.phase === 'cleaning');
}

/** The door of a unit: the column in the middle of its footprint (routing 3). */
export function doorOf(unit: Unit): TrekPlace {
  return { level: unit.level, column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width / 2) };
}

function isRoom(unit: Unit | undefined): unit is RoomUnit {
  return unit !== undefined && isHotelRoomType(unit.type) && unit.hotel !== null;
}

function roomOf(state: TowerState, roomNumber: number): RoomUnit | null {
  const unit = state.units[`u${roomNumber}`];
  return isRoom(unit) ? unit : null;
}

function stepOfDay(step: number): number {
  return step % STEPS_PER_DAY;
}

function isAskingWindow(step: number): boolean {
  const time = stepOfDay(step);
  return time >= ASK_FROM_STEP && time < ASK_BEFORE_STEP;
}

/** The shift is over from the leave minute until the next morning's arrival. */
function isShiftOver(step: number): boolean {
  const time = stepOfDay(step);
  return time >= LEAVE_STEP || time < APPEAR_STEP;
}

/** Every retry minute while the window is open (hotel spec 4.1). */
function isRetryStep(step: number): boolean {
  return isAskingWindow(step) && (stepOfDay(step) - ASK_FROM_STEP) % RETRY_STEPS === 0;
}

function isAt(pool: PersonPool, slot: number, place: TrekPlace): boolean {
  return pool.level[slot] === place.level && pool.column[slot] === place.column;
}

function isHeadingTo(pool: PersonPool, slot: number, place: TrekPlace): boolean {
  return (
    isOnTrek(pool, slot) &&
    pool.trekLevel[slot] === place.level &&
    pool.trekColumn[slot] === place.column
  );
}

/** Rooms claimed by any maid; the claim lives only on the maid, so it ends when she leaves. */
function claimedRooms(pool: PersonPool): Set<number> {
  const claimed = new Set<number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    const task = maidTaskAt(pool, slot);
    if (holdsClaim(task)) claimed.add(task.room);
  }
  return claimed;
}

/**
 * Dirty rooms nobody has claimed, in the order a maid at `from` takes them (hotel spec 4.2):
 * fewer floors away, above before below, fewer columns from her to the door, lower unit id.
 */
export function roomsInPickOrder(
  state: TowerState,
  from: TrekPlace,
  claimed: ReadonlySet<number>,
): RoomUnit[] {
  const fromFloor = floorIndex(from.level);
  const candidates: {
    room: RoomUnit;
    floors: number;
    below: number;
    columns: number;
    id: number;
  }[] = [];
  for (const unit of Object.values(state.units)) {
    if (!isRoom(unit) || unit.hotel.state !== 'dirty') continue;
    const id = unitNumber(unit.id);
    if (claimed.has(id)) continue;
    const floorsUp = floorIndex(unit.level) - fromFloor;
    candidates.push({
      room: unit,
      floors: Math.abs(floorsUp),
      below: floorsUp < 0 ? 1 : 0,
      columns: Math.abs(doorOf(unit).column - from.column),
      id,
    });
  }
  candidates.sort(
    (a, b) => a.floors - b.floors || a.below - b.below || a.columns - b.columns || a.id - b.id,
  );
  return candidates.map((candidate) => candidate.room);
}

interface Maid {
  context: StepContext;
  slot: number;
  claimed: Set<number>;
}

function save(maid: Maid, task: MaidTask): void {
  maid.context.state.people.trip[maid.slot] = encodeMaidTask(task);
}

function placeOf(maid: Maid): TrekPlace {
  const pool = maid.context.state.people;
  return { level: pool.level[maid.slot] as number, column: pool.column[maid.slot] as number };
}

function stopTrek(maid: Maid): void {
  if (isOnTrek(maid.context.state.people, maid.slot)) cancelTrek(maid.context, maid.slot);
}

/** Walks back to her unit, or stays there; a maid with no route back stays where she is. */
function goBack(maid: Maid, task: MaidTask): void {
  const { state } = maid.context;
  const pool = state.people;
  save(maid, task);
  pool.dueStep[maid.slot] = NOTHING_DUE;
  const unit = state.units[`u${pool.homeUnit[maid.slot]}`];
  if (!unit) return;
  const door = doorOf(unit);
  if (isHeadingTo(pool, maid.slot, door)) return;
  stopTrek(maid);
  if (!isAt(pool, maid.slot, door)) startTrek(maid.context, maid.slot, door);
}

/** Hotel spec 4.1 and 4.2: claims the first reachable room, or goes back to her unit. */
function ask(maid: Maid, cleanings: number): void {
  const { state } = maid.context;
  if (!isAskingWindow(state.step)) {
    goBack(maid, { phase: 'waiting', room: 0, cleanings });
    return;
  }
  const rooms = roomsInPickOrder(state, placeOf(maid), maid.claimed);
  if (rooms.length > 0) stopTrek(maid);
  for (const room of rooms) {
    if (!startTrek(maid.context, maid.slot, doorOf(room))) continue;
    const roomNumber = unitNumber(room.id);
    maid.claimed.add(roomNumber);
    save(maid, { phase: 'toRoom', room: roomNumber, cleanings });
    if (!isOnTrek(state.people, maid.slot)) reachRoom(maid, room, cleanings);
    return;
  }
  goBack(maid, { phase: 'waiting', room: 0, cleanings });
}

function dropClaim(maid: Maid, task: MaidTask): void {
  maid.claimed.delete(task.room);
}

/** Hotel spec 5: starts the cleaning before 17:00, otherwise releases the claim and goes back. */
function reachRoom(maid: Maid, room: RoomUnit, cleanings: number): void {
  const { state } = maid.context;
  const roomNumber = unitNumber(room.id);
  if (stepOfDay(state.step) >= ASK_BEFORE_STEP) {
    maid.claimed.delete(roomNumber);
    goBack(maid, { phase: 'waiting', room: 0, cleanings });
    return;
  }
  save(maid, { phase: 'cleaning', room: roomNumber, cleanings: cleanings + 1 });
  state.people.dueStep[maid.slot] = state.step + CLEANING_STEPS;
}

function advanceToRoom(maid: Maid, task: MaidTask): void {
  const pool = maid.context.state.people;
  const room = roomOf(maid.context.state, task.room);
  if (!room || room.hotel.state !== 'dirty') {
    dropClaim(maid, task);
    ask(maid, task.cleanings);
    return;
  }
  if (isShiftOver(maid.context.state.step)) {
    dropClaim(maid, task);
    goBack(maid, { phase: 'waiting', room: 0, cleanings: task.cleanings });
    return;
  }
  if (trekPhaseAt(pool, maid.slot) === 'noRoute') {
    dropClaim(maid, task);
    stopTrek(maid);
    ask(maid, task.cleanings);
    return;
  }
  if (isOnTrek(pool, maid.slot)) return;
  if (!isAt(pool, maid.slot, doorOf(room))) {
    dropClaim(maid, task);
    ask(maid, task.cleanings);
    return;
  }
  reachRoom(maid, room, task.cleanings);
}

function advanceCleaning(maid: Maid, task: MaidTask): void {
  const { state } = maid.context;
  const room = roomOf(state, task.room);
  if (!room || room.hotel.state !== 'dirty') {
    dropClaim(maid, task);
    ask(maid, task.cleanings);
    return;
  }
  if (state.step < (state.people.dueStep[maid.slot] as number)) return;
  finishCleaning(maid.context, room.id);
  dropClaim(maid, task);
  ask(maid, task.cleanings);
}

/** The housekeeping unit of the maid, or null when it is gone. */
function homeOf(maid: Maid): Unit | null {
  const { state } = maid.context;
  return state.units[`u${state.people.homeUnit[maid.slot]}`] ?? null;
}

function startChanging(maid: Maid, phase: 'changingIn' | 'changingOut', task: MaidTask): void {
  const pool = maid.context.state.people;
  save(maid, { ...task, phase });
  pool.dueStep[maid.slot] = maid.context.state.step + CHANGE_CLOTHES_STEPS;
}

function removeMaid(maid: Maid): void {
  const { state } = maid.context;
  removePerson(state, state.people.id[maid.slot] as number);
}

/** She is out of uniform and walks to the nearest lobby end and on to the map edge, then home. */
function startLeaving(maid: Maid, task: MaidTask): void {
  const { state } = maid.context;
  const pool = state.people;
  const near = nearestStreetColumn(pool.column[maid.slot] as number) !== 0;
  save(maid, { ...task, phase: 'leaving', room: 0 });
  pool.dueStep[maid.slot] = NOTHING_DUE;
  for (const onRight of [near, !near]) {
    const exit = entrancePlace(state, onRight);
    if (exit && startTrek(maid.context, maid.slot, exit, streetColumn(onRight))) return;
  }
  // No way out of the tower: she is let go where she stands.
  removeMaid(maid);
}

/** The shift is over and she is waiting at her door: she changes back before walking out. */
function endShift(maid: Maid, task: MaidTask): void {
  const pool = maid.context.state.people;
  const unit = homeOf(maid);
  if (!unit) {
    startLeaving(maid, task);
    return;
  }
  const door = doorOf(unit);
  if (isAt(pool, maid.slot, door) && !isOnTrek(pool, maid.slot)) {
    startChanging(maid, 'changingOut', task);
    return;
  }
  if (!isHeadingTo(pool, maid.slot, door)) goBack(maid, { ...task, phase: 'waiting', room: 0 });
}

/** She has walked in from the street and stands at her door, or her walk failed. */
function advanceArriving(maid: Maid, task: MaidTask): void {
  const pool = maid.context.state.people;
  const unit = homeOf(maid);
  if (!unit) {
    removeMaid(maid);
    return;
  }
  if (isOnTrek(pool, maid.slot)) return;
  const door = doorOf(unit);
  if (isAt(pool, maid.slot, door)) {
    startChanging(maid, 'changingIn', task);
    return;
  }
  if (!startTrek(maid.context, maid.slot, door)) removeMaid(maid);
}

function advanceMaid(maid: Maid): void {
  const task = maidTaskAt(maid.context.state.people, maid.slot);
  if (!task) return;
  const { state } = maid.context;
  const pool = state.people;
  switch (task.phase) {
    case 'arriving':
      advanceArriving(maid, task);
      return;
    case 'changingIn':
      if (state.step >= (pool.dueStep[maid.slot] as number)) ask(maid, task.cleanings);
      return;
    case 'changingOut':
      if (state.step >= (pool.dueStep[maid.slot] as number)) startLeaving(maid, task);
      return;
    case 'leaving':
      if (!isOnTrek(pool, maid.slot)) removeMaid(maid);
      return;
    case 'toRoom':
      advanceToRoom(maid, task);
      return;
    case 'cleaning':
      advanceCleaning(maid, task);
      return;
    case 'waiting':
      if (isShiftOver(state.step)) endShift(maid, task);
      else if (isRetryStep(state.step)) ask(maid, task.cleanings);
      return;
    case 'finished':
      if (isShiftOver(state.step)) endShift(maid, task);
      // Saved with the old daily limit: she goes back to work until the end of the shift.
      else if (isRetryStep(state.step)) ask(maid, task.cleanings);
      return;
  }
}

/**
 * Moves every maid on by one step in increasing person id, after the trek system has moved her,
 * so a maid with a lower id claims first (hotel spec 4.1). Maids exist from the morning arrival
 * until they have walked out after the shift.
 */
export function createMaidSystem(): SimulationSystem {
  return (context) => {
    const pool = context.state.people;
    let claimed: Set<number> | null = null;
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (!isMaid(pool, slot)) continue;
      claimed ??= claimedRooms(pool);
      const id = pool.id[slot] as number;
      advanceMaid({ context, slot, claimed });
      // A maid who walked out removed herself, which moved the next person into her slot.
      if (pool.id[slot] !== id) slot -= 1;
    }
  };
}

function housekeepingUnits(state: TowerState): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.type === 'housekeeping')
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/**
 * At the arrival minute the maids of every housekeeping unit come in from the street: each one
 * appears at a map edge in civilian clothes and walks to the door of her unit.
 */
function bringMaids(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  // Anyone left from an earlier day, or from a save made before the shift changed, goes first.
  for (let slot = pool.id.length - 1; slot >= 0; slot--) {
    if (isMaid(pool, slot)) removePerson(state, pool.id[slot] as number);
  }
  const count = UNIT_CATALOG.housekeeping.capacity?.people ?? 0;
  for (const unit of housekeepingUnits(state)) {
    const door = doorOf(unit);
    for (let index = 0; index < count; index++) {
      const onRight = chance(state.rng, 0.5);
      const street = streetPlace(onRight);
      addPerson(state, {
        kind: 'maid',
        homeUnit: unitNumber(unit.id),
        level: street.level,
        column: street.column,
      });
      const slot = state.people.id.length - 1;
      state.people.trip[slot] = encodeMaidTask({ phase: 'arriving', room: 0, cleanings: 0 });
      if (startTrek(context, slot, door)) continue;
      // No route in from the street (no lobby): she starts in her room instead.
      state.people.level[slot] = door.level;
      state.people.column[slot] = door.column;
    }
  }
}

export const maidArrivalHook: ScheduledHook = {
  name: 'maid-arrival',
  schedule: {
    every: 'day',
    hour: Math.floor(MAID_APPEAR_MINUTE / 60),
    minute: MAID_APPEAR_MINUTE % 60,
  },
  run: bringMaids,
};

export interface HousekeepingSummary {
  /** Maids of the unit holding a claim (hotel spec H-25). */
  working: number;
  maids: number;
  /** Dirty rooms in the whole tower; infested rooms do not count. */
  dirtyRooms: number;
}

/** What the Limpieza window shows for one housekeeping unit. */
export function housekeepingSummary(state: TowerState, unitId: UnitId): HousekeepingSummary {
  const homeUnit = unitNumber(unitId);
  const pool = state.people;
  let working = 0;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] === homeUnit && holdsClaim(maidTaskAt(pool, slot))) working += 1;
  }
  let dirtyRooms = 0;
  for (const unit of Object.values(state.units)) {
    if (isRoom(unit) && unit.hotel.state === 'dirty') dirtyRooms += 1;
  }
  return { working, maids: UNIT_CATALOG.housekeeping.capacity?.people ?? 0, dirtyRooms };
}
