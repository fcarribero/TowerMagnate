import {
  CLEANER_CHANGE_MINUTES,
  CLEANER_CREW_SIZE,
  CLEANER_DIRT_MINUTE,
  CLEANER_COLUMN_WEIGHT,
  CLEANER_IDLE_MINUTES,
  CLEANER_LAST_START_MINUTES,
  CLEANER_LEVEL_WEIGHT,
  CLEANER_MIN_DIRT,
  CLEANER_SHIFT_MINUTES,
  CLEANER_SHIFT_START_MINUTE,
  CLEANER_SPEED_SHARE,
  CLEANER_SPOT_MINUTES,
  CLEANER_STAFF_BONUS,
  GARBAGE_PILE_POSITION,
  indexToLevel,
  LAST_COLUMN,
  levelToIndex,
  PERSON_KINDS,
  UNIT_CATALOG,
  type PersonPool,
  type TowerState,
  type Unit,
  type VenueDay,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace } from './office-routine';
import { addPerson, NO_TRIP, NOTHING_DUE, removePerson } from './people';
import { chance, nextInt } from './rng';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { streetColumn, streetPlace } from './street';
import { cancelTrek, isOnTrek, startTrek, trekPhaseAt, type TrekPlace } from './trek';
import { unitNumber } from './units';

const CLEANER_KIND = PERSON_KINDS.indexOf('cleaner');
const COLUMNS = LAST_COLUMN + 1;
const SHIFT_START_STEP = CLEANER_SHIFT_START_MINUTE * STEPS_PER_MINUTE;
const SHIFT_STEPS = CLEANER_SHIFT_MINUTES * STEPS_PER_MINUTE;
const SHIFTS = Math.round(STEPS_PER_DAY / SHIFT_STEPS);
const LAST_START_STEP = SHIFT_STEPS - CLEANER_LAST_START_MINUTES * STEPS_PER_MINUTE;
const CHANGE_STEPS = CLEANER_CHANGE_MINUTES * STEPS_PER_MINUTE;
const SPOT_STEPS = CLEANER_SPOT_MINUTES * STEPS_PER_MINUTE;
const IDLE_STEPS = CLEANER_IDLE_MINUTES * STEPS_PER_MINUTE;
/** A spot with less dirt than this is clean; the cleaner moves on. */
const CLEAN_ENOUGH = 0.05;
/** Spots chosen by one cleaner keep the others this many columns away on the same level. */
const SPOT_GAP = 3;
/** The dirtiest spots a cleaner tries, in order, before waiting in the room. */
const SPOT_TRIES = 5;

/**
 * What a cleaner is doing, kept in the person's `trip` number with a target: the unit number of a
 * garbage pile, the cell of a dirty spot, or the bags carried. A cleaner walks in from the street
 * in everyday clothes (`arriving`), changes in the cleaning room (`changingIn`), works, walks back
 * to the room at the end of the shift (`returning`), changes again (`changingOut`) and leaves.
 * The shift is the one the cleaner came in for: 0 from 06:00, 1 from 14:00, 2 from 22:00.
 */
export type CleanerPhase =
  | 'arriving'
  | 'changingIn'
  | 'choosing'
  | 'toPile'
  | 'carrying'
  | 'toSpot'
  | 'cleaning'
  | 'idle'
  | 'returning'
  | 'changingOut'
  | 'leaving';

const PHASES: readonly CleanerPhase[] = [
  'arriving',
  'changingIn',
  'choosing',
  'toPile',
  'carrying',
  'toSpot',
  'cleaning',
  'idle',
  'returning',
  'changingOut',
  'leaving',
];

export interface CleanerTask {
  phase: CleanerPhase;
  target: number;
  /** The shift the cleaner works; null for a cleaner saved before there were shifts. */
  shift: number | null;
}

/** Targets stay under this; the shift is packed above them, so old saves read as no shift. */
const TARGET_RANGE = 2 ** 22;
const SHIFT_UNIT = TARGET_RANGE * PHASES.length;

export function encodeCleanerTask(task: CleanerTask): number {
  const shift = task.shift === null ? 0 : task.shift + 1;
  return shift * SHIFT_UNIT + task.target * PHASES.length + PHASES.indexOf(task.phase) + 1;
}

export function decodeCleanerTask(trip: number): CleanerTask | null {
  if (trip <= NO_TRIP) return null;
  const code = (trip - 1) % SHIFT_UNIT;
  const shift = Math.floor((trip - 1) / SHIFT_UNIT);
  const phase = PHASES[code % PHASES.length];
  if (!phase) return null;
  return { phase, target: Math.floor(code / PHASES.length), shift: shift === 0 ? null : shift - 1 };
}

/** The shift under way at a step, and how far into it the step is. */
function shiftAt(step: number): { shift: number; into: number } {
  const time = (step - SHIFT_START_STEP + STEPS_PER_DAY) % STEPS_PER_DAY;
  return { shift: Math.floor(time / SHIFT_STEPS) % SHIFTS, into: time % SHIFT_STEPS };
}

export function isCleaner(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === CLEANER_KIND;
}

function taskAt(pool: PersonPool, slot: number): CleanerTask | null {
  return decodeCleanerTask(pool.trip[slot] ?? NO_TRIP);
}

/** True for a cleaner carrying garbage bags to a recycling center or out of the tower. */
export function isCleanerCarrying(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === CLEANER_KIND && taskAt(pool, slot)?.phase === 'carrying';
}

/** True while the cleaner wears work clothes: from changing in to the end of changing out. */
export function cleanerWearsUniform(pool: PersonPool, slot: number): boolean {
  const phase = taskAt(pool, slot)?.phase;
  return (
    phase !== undefined && phase !== 'arriving' && phase !== 'changingIn' && phase !== 'leaving'
  );
}

/** The cell code of a spot: dense level index times the columns, plus the column. */
export function spotCode(level: number, column: number): number {
  return levelToIndex(level) * COLUMNS + column;
}

function spotPlace(code: number): TrekPlace {
  return { level: indexToLevel(Math.floor(code / COLUMNS)), column: code % COLUMNS };
}

function upgradeLevel(unit: Unit | null, id: string): number {
  return unit?.upgrades?.[id] ?? 0;
}

/** Cleaners a room sends: the base crew plus a few for each level of staff. */
export function cleanerCrewSize(room: Unit): number {
  return CLEANER_CREW_SIZE + CLEANER_STAFF_BONUS * upgradeLevel(room, 'staff');
}

/** Dirt one cleaner of the room takes off each cell it cleans in a minute. */
export function cleanerRate(room: Unit | null): number {
  return CLEANER_DIRT_MINUTE * (1 + CLEANER_SPEED_SHARE * upgradeLevel(room, 'collectionSpeed'));
}

function roomOf(state: TowerState, pool: PersonPool, slot: number): Unit | null {
  const unit = state.units[`u${pool.homeUnit[slot]}`];
  return unit?.type === 'cleaning-room' ? unit : null;
}

function doorOf(unit: Unit): TrekPlace {
  return { level: unit.level, column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width / 2) };
}

function pileOf(unit: Unit): TrekPlace {
  return {
    level: unit.level,
    column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width * GARBAGE_PILE_POSITION),
  };
}

/** Whether the cleaner's own shift is still under way. */
function isOnShift(pool: PersonPool, slot: number, step: number): boolean {
  return taskAt(pool, slot)?.shift === shiftAt(step).shift;
}

function isCrewStartTime(step: number): boolean {
  return step % STEPS_PER_MINUTE === 0 && shiftAt(step).into < LAST_START_STEP;
}

const roomsMemo = new WeakMap<TowerState['units'], Unit[]>();

/** The cleaning rooms of the tower, by unit number; kept while the units record is the same. */
function roomsOf(state: TowerState): Unit[] {
  const kept = roomsMemo.get(state.units);
  if (kept) return kept;
  const rooms = Object.values(state.units)
    .filter((unit) => unit.type === 'cleaning-room')
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  roomsMemo.set(state.units, rooms);
  return rooms;
}

interface Shared {
  context: StepContext;
  /** Pile unit numbers held by a cleaner heading to them. */
  piles: Set<number>;
  /** Spot codes held by a cleaner heading to them or cleaning them. */
  spots: Set<number>;
  /** Every cell with enough dirt this step, worked out on first need. */
  dirty: DirtySpot[] | null;
  /** Those cells best first for each cleaning room, by room unit number, worked out on first need. */
  ranked: Map<number, number[]>;
}

interface Cleaner {
  shared: Shared;
  slot: number;
}

function poolOf(cleaner: Cleaner): PersonPool {
  return cleaner.shared.context.state.people;
}

/** Keeps the cleaner's phase and target; the shift stays the one they came in for. */
function save(cleaner: Cleaner, task: Omit<CleanerTask, 'shift'>): void {
  const pool = poolOf(cleaner);
  const shift = taskAt(pool, cleaner.slot)?.shift ?? null;
  pool.trip[cleaner.slot] = encodeCleanerTask({ ...task, shift });
}

function here(cleaner: Cleaner): TrekPlace {
  const pool = poolOf(cleaner);
  return { level: pool.level[cleaner.slot] as number, column: pool.column[cleaner.slot] as number };
}

function isAt(cleaner: Cleaner, place: TrekPlace): boolean {
  const at = here(cleaner);
  return at.level === place.level && at.column === place.column;
}

function stopTrek(cleaner: Cleaner): void {
  if (isOnTrek(poolOf(cleaner), cleaner.slot)) cancelTrek(cleaner.shared.context, cleaner.slot);
}

/** Walks to the street by a lobby end and leaves the tower there; with no way out, leaves at once. */
function walkOut(cleaner: Cleaner, phase: 'leaving' | 'carrying', target: number): boolean {
  const { context } = cleaner.shared;
  const onRight = chance(context.state.rng, 0.5);
  for (const side of [onRight, !onRight]) {
    const exit = entrancePlace(context.state, side);
    if (!exit) break;
    save(cleaner, { phase, target });
    if (startTrek(context, cleaner.slot, exit, streetColumn(side))) return true;
  }
  return false;
}

function leave(cleaner: Cleaner): void {
  stopTrek(cleaner);
  if (walkOut(cleaner, 'leaving', 0)) return;
  const pool = poolOf(cleaner);
  removePerson(cleaner.shared.context.state, pool.id[cleaner.slot] as number);
}

function startChanging(cleaner: Cleaner, phase: 'changingIn' | 'changingOut'): void {
  save(cleaner, { phase, target: 0 });
  const { state } = cleaner.shared.context;
  state.people.dueStep[cleaner.slot] = state.step + CHANGE_STEPS;
}

/** The shift is over: walk back to the room to change, or straight out when the room is gone. */
function goHome(cleaner: Cleaner): void {
  const { state } = cleaner.shared.context;
  const pool = state.people;
  const room = roomOf(state, pool, cleaner.slot);
  if (!room || !cleanerWearsUniform(pool, cleaner.slot)) {
    leave(cleaner);
    return;
  }
  stopTrek(cleaner);
  const door = doorOf(room);
  if (isAt(cleaner, door)) {
    startChanging(cleaner, 'changingOut');
    return;
  }
  save(cleaner, { phase: 'returning', target: 0 });
  if (!startTrek(cleaner.shared.context, cleaner.slot, door)) leave(cleaner);
}

/** Nothing to do: wait at the room door for a while, then look again. */
function idle(cleaner: Cleaner): void {
  const { context } = cleaner.shared;
  const pool = context.state.people;
  const room = roomOf(context.state, pool, cleaner.slot);
  stopTrek(cleaner);
  save(cleaner, { phase: 'idle', target: 0 });
  pool.dueStep[cleaner.slot] = context.state.step + IDLE_STEPS;
  if (room && !isAt(cleaner, doorOf(room))) startTrek(context, cleaner.slot, doorOf(room));
}

/** The venue piles with bags in them, nearest level first, then by unit number. */
function pilesInOrder(state: TowerState, level: number): Unit[] {
  const piles: Unit[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.venue && unit.venue.garbage > 0) piles.push(unit);
  }
  return piles.sort(
    (a, b) =>
      Math.abs(a.level - level) - Math.abs(b.level - level) || unitNumber(a.id) - unitNumber(b.id),
  );
}

interface DirtySpot {
  code: number;
  level: number;
  column: number;
  dirt: number;
}

/** Every built cell with enough dirt to be worth the walk. */
function dirtySpots(state: TowerState): DirtySpot[] {
  const rows = state.heat?.dirt;
  if (!rows) return [];
  const found: DirtySpot[] = [];
  for (const key of Object.keys(rows)) {
    const row = rows[key] as number[];
    const level = Number(key);
    const base = levelToIndex(level) * COLUMNS;
    for (let column = 0; column < row.length; column++) {
      const dirt = row[column] as number;
      if (dirt >= CLEANER_MIN_DIRT) found.push({ code: base + column, level, column, dirt });
    }
  }
  return found;
}

/** How much a cleaner of the room wants a spot: its dirt, less the farther it is from the room. */
export function spotScore(dirt: number, levelsAway: number, columnsAway: number): number {
  return dirt / (1 + CLEANER_LEVEL_WEIGHT * levelsAway + CLEANER_COLUMN_WEIGHT * columnsAway);
}

/** The dirty spots best first for the cleaners of a room: dirtiest and nearest the room door. */
function rankSpots(spots: readonly DirtySpot[], room: Unit): number[] {
  const door = doorOf(room);
  return spots
    .map((spot) => ({
      code: spot.code,
      score: spotScore(
        spot.dirt,
        Math.abs(spot.level - door.level),
        Math.abs(spot.column - door.column),
      ),
    }))
    .sort((a, b) => b.score - a.score || a.code - b.code)
    .map((spot) => spot.code);
}

function rankedFor(shared: Shared, room: Unit): number[] {
  const number = unitNumber(room.id);
  let ranked = shared.ranked.get(number);
  if (!ranked) {
    shared.dirty ??= dirtySpots(shared.context.state);
    ranked = rankSpots(shared.dirty, room);
    shared.ranked.set(number, ranked);
  }
  return ranked;
}

function isNearHeldSpot(spots: Set<number>, code: number): boolean {
  for (let gap = -SPOT_GAP; gap <= SPOT_GAP; gap++) {
    if (spots.has(code + gap)) return true;
  }
  return false;
}

/**
 * Takes the nearest pile nobody holds, else the best spot nobody is near (dirty and close to the
 * room), else waits.
 */
function choose(cleaner: Cleaner): void {
  const { shared } = cleaner;
  const { context } = shared;
  const { state } = context;
  stopTrek(cleaner);
  for (const unit of pilesInOrder(state, here(cleaner).level)) {
    const number = unitNumber(unit.id);
    if (shared.piles.has(number)) continue;
    const pile = pileOf(unit);
    if (isAt(cleaner, pile)) {
      shared.piles.add(number);
      save(cleaner, { phase: 'toPile', target: number });
      takeBags(cleaner, number);
      return;
    }
    if (startTrek(context, cleaner.slot, pile)) {
      shared.piles.add(number);
      save(cleaner, { phase: 'toPile', target: number });
      return;
    }
  }
  const room = roomOf(state, state.people, cleaner.slot);
  if (!room) {
    idle(cleaner);
    return;
  }
  let tries = 0;
  for (const code of rankedFor(shared, room)) {
    if (isNearHeldSpot(shared.spots, code)) continue;
    if (tries++ >= SPOT_TRIES) break;
    const spot = spotPlace(code);
    if (isAt(cleaner, spot)) {
      startCleaning(cleaner, code);
      return;
    }
    if (startTrek(context, cleaner.slot, spot)) {
      shared.spots.add(code);
      save(cleaner, { phase: 'toSpot', target: code });
      return;
    }
  }
  idle(cleaner);
}

function startCleaning(cleaner: Cleaner, code: number): void {
  const { state } = cleaner.shared.context;
  cleaner.shared.spots.add(code);
  save(cleaner, { phase: 'cleaning', target: code });
  state.people.dueStep[cleaner.slot] = state.step + SPOT_STEPS;
}

/** The recycling centers, nearest level to `level` first, then by unit number. */
function recyclingInOrder(state: TowerState, level: number): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.type === 'recycling-center')
    .sort(
      (a, b) =>
        Math.abs(a.level - level) - Math.abs(b.level - level) ||
        unitNumber(a.id) - unitNumber(b.id),
    );
}

/** Carries the bags to the nearest recycling center it can reach, or else out to the street. */
function carryBags(cleaner: Cleaner, bags: number): boolean {
  const { context } = cleaner.shared;
  for (const center of recyclingInOrder(context.state, here(cleaner).level)) {
    save(cleaner, { phase: 'carrying', target: bags });
    if (startTrek(context, cleaner.slot, doorOf(center))) return true;
  }
  return walkOut(cleaner, 'carrying', bags);
}

/**
 * At the pile: take as many bags as the tools allow and carry them to a recycling center, or out
 * to the street when the tower has none.
 */
function takeBags(cleaner: Cleaner, number: number): void {
  const { state } = cleaner.shared.context;
  const unit = state.units[`u${number}`];
  const garbage = unit?.venue?.garbage ?? 0;
  if (!unit || garbage <= 0) {
    choose(cleaner);
    return;
  }
  const room = roomOf(state, state.people, cleaner.slot);
  const bags = Math.min(garbage, 1 + upgradeLevel(room, 'tools'));
  if (!carryBags(cleaner, bags)) {
    idle(cleaner);
    return;
  }
  const writable = writableUnit(state, unit);
  (writable.venue as VenueDay).garbage -= bags;
}

/** Takes dirt off the spot and, with materials, the cells beside it; true when the spot is clean. */
function clean(cleaner: Cleaner, code: number): boolean {
  const { state } = cleaner.shared.context;
  const spot = spotPlace(code);
  const row = state.heat?.dirt[spot.level];
  if (!row) return true;
  const room = roomOf(state, state.people, cleaner.slot);
  const rate = cleanerRate(room);
  const reach = upgradeLevel(room, 'materials');
  for (let column = spot.column - reach; column <= spot.column + reach; column++) {
    if (column < 0 || column > LAST_COLUMN) continue;
    row[column] = Math.max(0, (row[column] as number) - rate);
  }
  return (row[spot.column] as number) < CLEAN_ENOUGH;
}

/** A trip that found no way on ends where the cleaner stands, and the cleaner waits. */
function isStuck(cleaner: Cleaner): boolean {
  if (trekPhaseAt(poolOf(cleaner), cleaner.slot) !== 'noRoute') return false;
  idle(cleaner);
  return true;
}

function advanceCleaner(cleaner: Cleaner): void {
  const { context } = cleaner.shared;
  const { state } = context;
  const pool = state.people;
  const slot = cleaner.slot;
  let task = taskAt(pool, slot);
  if (!task) {
    leave(cleaner);
    return;
  }
  if (task.shift === null) {
    // Saved before there were shifts: the cleaner works the shift under way.
    task = { ...task, shift: shiftAt(state.step).shift };
    pool.trip[slot] = encodeCleanerTask(task);
  }
  const onShift = isOnShift(pool, slot, state.step);
  const room = roomOf(state, pool, slot);
  switch (task.phase) {
    case 'leaving':
      if (!isOnTrek(pool, slot)) removePerson(state, pool.id[slot] as number);
      return;
    case 'arriving':
      if (isOnTrek(pool, slot)) return;
      if (!room || !onShift) leave(cleaner);
      else if (isAt(cleaner, doorOf(room))) startChanging(cleaner, 'changingIn');
      else if (!startTrek(context, slot, doorOf(room))) leave(cleaner);
      return;
    case 'changingIn':
      if (state.step < (pool.dueStep[slot] as number)) return;
      pool.dueStep[slot] = NOTHING_DUE;
      save(cleaner, { phase: 'choosing', target: 0 });
      if (onShift && room) choose(cleaner);
      else goHome(cleaner);
      return;
    case 'returning':
      if (isOnTrek(pool, slot)) return;
      if (room && isAt(cleaner, doorOf(room))) startChanging(cleaner, 'changingOut');
      else leave(cleaner);
      return;
    case 'changingOut':
      if (state.step < (pool.dueStep[slot] as number)) return;
      pool.dueStep[slot] = NOTHING_DUE;
      leave(cleaner);
      return;
    default:
      break;
  }
  if (!room || !onShift) {
    // Bags already on the way are dropped at the recycling center or the street first.
    if (task.phase === 'carrying' && isOnTrek(pool, slot)) return;
    goHome(cleaner);
    return;
  }
  switch (task.phase) {
    case 'choosing':
      choose(cleaner);
      return;
    case 'toPile':
      if (isOnTrek(pool, slot)) {
        isStuck(cleaner);
        return;
      }
      takeBags(cleaner, task.target);
      return;
    case 'carrying':
      if (isOnTrek(pool, slot)) {
        isStuck(cleaner);
        return;
      }
      choose(cleaner);
      return;
    case 'toSpot':
      if (isOnTrek(pool, slot)) {
        isStuck(cleaner);
        return;
      }
      if (isAt(cleaner, spotPlace(task.target))) startCleaning(cleaner, task.target);
      else choose(cleaner);
      return;
    case 'cleaning':
      if (state.step % STEPS_PER_MINUTE !== 0) return;
      if (clean(cleaner, task.target) || state.step >= (pool.dueStep[slot] as number)) {
        cleaner.shared.spots.delete(task.target);
        pool.dueStep[slot] = NOTHING_DUE;
        choose(cleaner);
      }
      return;
    case 'idle':
      if (state.step < (pool.dueStep[slot] as number)) return;
      pool.dueStep[slot] = NOTHING_DUE;
      choose(cleaner);
      return;
  }
}

function cleanerSlots(pool: PersonPool): number[] {
  const slots: number[] = [];
  const kinds = pool.kind;
  for (let slot = 0; slot < kinds.length; slot++) {
    if (kinds[slot] === CLEANER_KIND) slots.push(slot);
  }
  return slots;
}

/** The piles and spots held right now by the cleaners walking to them or cleaning them. */
function heldBy(
  pool: PersonPool,
  slots: readonly number[],
): { piles: Set<number>; spots: Set<number> } {
  const piles = new Set<number>();
  const spots = new Set<number>();
  for (const slot of slots) {
    const task = taskAt(pool, slot);
    if (task?.phase === 'toPile') piles.add(task.target);
    if (task?.phase === 'toSpot' || task?.phase === 'cleaning') spots.add(task.target);
  }
  return { piles, spots };
}

/** A room's crew comes in from the street in everyday clothes and walks to the room. */
function bringCrew(context: StepContext, room: Unit): void {
  const { state } = context;
  const left = entrancePlace(state, false);
  const right = entrancePlace(state, true);
  if (!left || !right) return;
  const low = Math.min(left.column, right.column);
  const high = Math.max(left.column, right.column);
  const door = doorOf(room);
  const size = cleanerCrewSize(room);
  for (let index = 0; index < size; index++) {
    const street = streetPlace(nextInt(state.rng, low, high) * 2 > low + high);
    const id = addPerson(state, {
      kind: 'cleaner',
      homeUnit: unitNumber(room.id),
      level: street.level,
      column: street.column,
    });
    const slot = state.people.id.length - 1;
    state.people.trip[slot] = encodeCleanerTask({
      phase: 'arriving',
      target: 0,
      shift: shiftAt(state.step).shift,
    });
    if (!startTrek(context, slot, door)) removePerson(state, id);
  }
}

/**
 * Each cleaning room sends its crew in at the start of each shift, or later in it while the room
 * has no cleaners of that shift in the tower; then every cleaner moves on by one step. Without cleaning rooms
 * the cleaners still in the tower are only looked at once a minute, on their way out.
 */
export function createCleaningSystem(): SimulationSystem {
  return (context) => {
    const { state } = context;
    const rooms = roomsOf(state);
    if (rooms.length === 0 && state.step % STEPS_PER_MINUTE !== 0) return;
    const pool = state.people;
    let slots = cleanerSlots(pool);
    if (rooms.length > 0 && isCrewStartTime(state.step)) {
      const present = new Set<number>();
      for (const slot of slots) {
        if (isOnShift(pool, slot, state.step)) present.add(pool.homeUnit[slot] as number);
      }
      const before = pool.id.length;
      for (const room of rooms) {
        if (!present.has(unitNumber(room.id))) bringCrew(context, room);
      }
      if (pool.id.length !== before) slots = cleanerSlots(pool);
    }
    if (slots.length === 0) return;
    const shared: Shared = { context, ...heldBy(pool, slots), dirty: null, ranked: new Map() };
    // Backwards, because a cleaner who leaves the tower is removed from the pool.
    for (let index = slots.length - 1; index >= 0; index--) {
      advanceCleaner({ shared, slot: slots[index] as number });
    }
  };
}
