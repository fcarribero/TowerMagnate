import {
  CLEANING_MINUTES,
  CLEANING_START_BEFORE_MINUTE,
  CLEANING_START_FROM_MINUTE,
  MAID_APPEAR_MINUTE,
  MAID_DAILY_CLEANINGS,
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
 * `finished` has started every cleaning of the day and does not ask again.
 */
export type MaidPhase = 'waiting' | 'toRoom' | 'cleaning' | 'finished';

const PHASES: readonly MaidPhase[] = ['waiting', 'toRoom', 'cleaning', 'finished'];
const PHASE_RANGE = PHASES.length;
const CLEANINGS_RANGE = MAID_DAILY_CLEANINGS + 1;

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

/** 10:00 and every half hour after it while the window is open (hotel spec 4.1). */
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
  if (cleanings >= MAID_DAILY_CLEANINGS) {
    goBack(maid, { phase: 'finished', room: 0, cleanings });
    return;
  }
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

/** Hotel spec 5: starts the cleaning before 16:00, otherwise releases the claim and goes back. */
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

function advanceMaid(maid: Maid): void {
  const task = maidTaskAt(maid.context.state.people, maid.slot);
  if (!task) return;
  switch (task.phase) {
    case 'toRoom':
      advanceToRoom(maid, task);
      return;
    case 'cleaning':
      advanceCleaning(maid, task);
      return;
    case 'waiting':
      if (isRetryStep(maid.context.state.step)) ask(maid, task.cleanings);
      return;
    case 'finished':
      return;
  }
}

function hasMaidsOnDuty(step: number): boolean {
  const time = stepOfDay(step);
  return time >= APPEAR_STEP && time < LEAVE_STEP;
}

/**
 * Moves every maid on by one step in increasing person id, after the trek system has moved her,
 * so a maid with a lower id claims first (hotel spec 4.1).
 */
export function createMaidSystem(): SimulationSystem {
  return (context) => {
    if (!hasMaidsOnDuty(context.state.step)) return;
    const pool = context.state.people;
    let claimed: Set<number> | null = null;
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (!isMaid(pool, slot)) continue;
      claimed ??= claimedRooms(pool);
      advanceMaid({ context, slot, claimed });
    }
  };
}

function housekeepingUnits(state: TowerState): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.type === 'housekeeping')
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** People spec 10: at 09:30 the maids of every housekeeping unit appear at its door. */
function bringMaids(context: StepContext): void {
  const { state } = context;
  const count = UNIT_CATALOG.housekeeping.capacity?.people ?? 0;
  for (const unit of housekeepingUnits(state)) {
    const door = doorOf(unit);
    for (let index = 0; index < count; index++) {
      addPerson(state, {
        kind: 'maid',
        homeUnit: unitNumber(unit.id),
        level: door.level,
        column: door.column,
      });
      const slot = state.people.id.length - 1;
      state.people.trip[slot] = encodeMaidTask({ phase: 'waiting', room: 0, cleanings: 0 });
    }
  }
}

/** People spec 10: at 17:00 every maid leaves wherever she is, and every claim goes with her. */
function sendMaidsAway(context: StepContext): void {
  const pool = context.state.people;
  const maids: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isMaid(pool, slot)) maids.push(pool.id[slot] as number);
  }
  for (const id of maids) removePerson(context.state, id);
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

export const maidLeaveHook: ScheduledHook = {
  name: 'maid-leave',
  schedule: {
    every: 'day',
    hour: Math.floor(MAID_LEAVE_MINUTE / 60),
    minute: MAID_LEAVE_MINUTE % 60,
  },
  run: sendMaidsAway,
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
