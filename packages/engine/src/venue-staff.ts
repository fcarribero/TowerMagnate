import {
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  STAFF_EARLY_ARRIVAL,
  UNIT_CATALOG,
  VENUE_STAFF,
  venueHoursOf,
  closingMinute,
  type EntityId,
  type PersonPool,
  type TowerState,
  type Unit,
  type UnitId,
  type VenueDay,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { isCleanerCarrying } from './cleaning';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace, unitPlace, type Place } from './office-routine';
import {
  addPerson,
  removePeopleOfUnit,
  createPeopleSystem,
  NO_TRIP,
  NOTHING_DUE,
  parseUnitNumber,
  personEntityId,
} from './people';
import { chance, nextInt } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { streetColumn, streetPlace } from './street';
import { cancelTrek, isOnTrek, startTrek } from './trek';
import { unitNumber } from './units';
import { customersInsideVenue } from './venue-visitors';
import { emitNews } from './news';

/**
 * What a crew member is doing: outside until the arrival step, walking in, working inside the
 * unit until closing, or walking out. `toPile` and `carrying` are only read from saves made when
 * the crew still carried the bags out themselves.
 */
export type StaffPhase = 'outside' | 'walkingIn' | 'working' | 'toPile' | 'carrying' | 'leaving';

const PHASES: readonly StaffPhase[] = [
  'outside',
  'walkingIn',
  'working',
  'toPile',
  'carrying',
  'leaving',
];

/** What one crew member is doing today, kept in the person's `trip` number. */
export interface StaffRoutine {
  phase: StaffPhase;
  /** The lobby end used to come in, tried first when walking out. */
  entranceOnRight: boolean;
}

const PHASE_RANGE = 8;

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodeStaffRoutine(routine: StaffRoutine): number {
  return (routine.entranceOnRight ? PHASE_RANGE : 0) + PHASES.indexOf(routine.phase) + 1;
}

export function decodeStaffRoutine(packedTrip: number): StaffRoutine | null {
  if (packedTrip === NO_TRIP) return null;
  const phase = PHASES[(packedTrip - 1) % PHASE_RANGE];
  if (!phase) return null;
  return { phase, entranceOnRight: packedTrip > PHASE_RANGE };
}

const STAFF_KIND = PERSON_KINDS.indexOf('staff');

function isStaff(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === STAFF_KIND;
}

/** The routine of the crew member in this slot, or null while they have none or are not crew. */
export function staffRoutineAt(pool: PersonPool, slot: number): StaffRoutine | null {
  return isStaff(pool, slot) ? decodeStaffRoutine(pool.trip[slot] ?? NO_TRIP) : null;
}

/** True for a crew member or a cleaner carrying a black garbage bag. */
export function isCarryingBag(pool: PersonPool, slot: number): boolean {
  return staffRoutineAt(pool, slot)?.phase === 'carrying' || isCleanerCarrying(pool, slot);
}

/** True for crew with no plan, or who are still waiting to arrive. */
export function isStaffOutside(pool: PersonPool, slot: number): boolean {
  const phase = staffRoutineAt(pool, slot)?.phase;
  return phase === undefined || phase === 'outside';
}

type StaffedType = keyof typeof VENUE_STAFF;

function isStaffedType(type: string): type is StaffedType {
  return Object.hasOwn(VENUE_STAFF, type);
}

interface StaffCounts {
  step: number;
  people: number;
  crew: Map<number, number>;
  working: Map<number, number>;
}

const staffCounts = new WeakMap<PersonPool, StaffCounts>();

function countStaff(pool: PersonPool, step: number): StaffCounts {
  const crew = new Map<number, number>();
  const working = new Map<number, number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isStaff(pool, slot)) continue;
    const home = pool.homeUnit[slot] as number;
    crew.set(home, (crew.get(home) ?? 0) + 1);
    if (staffRoutineAt(pool, slot)?.phase === 'working') {
      working.set(home, (working.get(home) ?? 0) + 1);
    }
  }
  return { step, people: pool.id.length, crew, working };
}

/** Counts per unit, rebuilt when the step or the number of people changed and when a worker starts or stops working. */
function countsOf(state: TowerState): StaffCounts {
  const pool = state.people;
  const cached = staffCounts.get(pool);
  if (cached && cached.step === state.step && cached.people === pool.id.length) return cached;
  const fresh = countStaff(pool, state.step);
  staffCounts.set(pool, fresh);
  return fresh;
}

function forgetCounts(pool: PersonPool): void {
  staffCounts.delete(pool);
}

/** How many crew members belong to the unit. */
export function crewOf(state: TowerState, unit: Pick<Unit, 'id'>): number {
  return countsOf(state).crew.get(unitNumber(unit.id)) ?? 0;
}

/**
 * True when the venue may open: it has no crew at all (units from old saves and tests), or every
 * crew member is inside it working. Units that are not crew venues are always staffed.
 */
export function isVenueStaffed(state: TowerState, unit: Pick<Unit, 'id' | 'type'>): boolean {
  if (!isStaffedType(unit.type)) return true;
  const counts = countsOf(state);
  const number = unitNumber(unit.id);
  const crew = counts.crew.get(number) ?? 0;
  return crew === 0 || (counts.working.get(number) ?? 0) >= crew;
}

function stayOutside(pool: PersonPool, slot: number): void {
  pool.trip[slot] = NO_TRIP;
  pool.dueStep[slot] = NOTHING_DUE;
}

function dayStartOf(step: number): number {
  return Math.floor(step / STEPS_PER_DAY) * STEPS_PER_DAY;
}

function closeStepOf(unit: Unit & { type: StaffedType }, step: number): number {
  const day = Math.floor(step / STEPS_PER_DAY);
  const minute = closingMinute(unit.type, venueHoursOf(unit).close, unit.id, day);
  return dayStartOf(step) + minute * STEPS_PER_MINUTE;
}

function drawEarlyMinutes(state: TowerState): number {
  return nextInt(state.rng, STAFF_EARLY_ARRIVAL.from, STAFF_EARLY_ARRIVAL.to);
}

function staffUnitOf(state: TowerState, slot: number): (Unit & { type: StaffedType }) | null {
  const id: UnitId = `u${state.people.homeUnit[slot]}`;
  const unit = Object.hasOwn(state.units, id) ? state.units[id] : undefined;
  return unit && isStaffedType(unit.type) ? (unit as Unit & { type: StaffedType }) : null;
}

/** Plans the day for one crew member who has none yet: arrive at open time minus a draw, or now if that is past. */
function planRestOfDay(state: TowerState, slot: number): void {
  const pool = state.people;
  const unit = staffUnitOf(state, slot);
  stayOutside(pool, slot);
  if (!unit) return;
  const earlyStep =
    dayStartOf(state.step) + (venueHoursOf(unit).open - drawEarlyMinutes(state)) * STEPS_PER_MINUTE;
  const arrival = Math.max(earlyStep, state.step + 1);
  if (arrival >= closeStepOf(unit, state.step)) return;
  pool.trip[slot] = encodeStaffRoutine({ phase: 'outside', entranceOnRight: false });
  pool.dueStep[slot] = arrival;
}

/** Whether the unit should have a crew: a shop only has one while it has a tenant. */
function needsCrew(unit: Unit): boolean {
  if (!isStaffedType(unit.type)) return false;
  if (!unit.activeToday) return false;
  return unit.type !== 'retail-shop' || unit.lease !== null;
}

/**
 * Hires the crew members the unit is missing, placed inside it. With `planToday`, each one gets
 * a plan for the rest of today when there is still time. Returns the new person ids.
 */
export function addCrew(
  state: TowerState,
  unitId: UnitId,
  options: { planToday?: boolean } = {},
): EntityId[] {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  const homeUnit = parseUnitNumber(unitId);
  if (!unit || homeUnit === null || !needsCrew(unit) || !isStaffedType(unit.type)) return [];
  const missing = VENUE_STAFF[unit.type].crew - crewOf(state, unit);
  const width = UNIT_CATALOG[unit.type].width;
  const created: EntityId[] = [];
  for (let index = 0; index < missing; index++) {
    const column = unit.x + nextInt(state.rng, 0, width - 1);
    const id = addPerson(state, { kind: 'staff', homeUnit, level: unit.level, column });
    created.push(personEntityId(id));
    if (options.planToday ?? true) planRestOfDay(state, state.people.id.length - 1);
  }
  forgetCounts(state.people);
  return created;
}

/**
 * Units whose crew is still closing at the 00:00 plan: a venue that closes at 24:00 has its crew
 * carrying out the garbage or waiting for the last customer when the new day starts.
 */
function unitsStillClosing(state: TowerState, step: number): Set<number> {
  const pool = state.people;
  const closing = new Set<number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isStaff(pool, slot)) continue;
    const phase = staffRoutineAt(pool, slot)?.phase;
    const atClosing = phase === 'working' && (pool.dueStep[slot] as number) <= step;
    if (phase === 'toPile' || phase === 'carrying' || phase === 'leaving' || atClosing) {
      closing.add(pool.homeUnit[slot] as number);
    }
  }
  return closing;
}

/**
 * At 00:00 venues missing crew get them (this covers old saves), then every crew member gets
 * today's arrival, in increasing person id. Anyone still on a trip stops where they are.
 */
function planDay(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const pool = state.people;
  const units = Object.values(state.units)
    .filter(needsCrew)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of units) addCrew(state, unit.id, { planToday: false });
  // A pile stays until the cleaners carry it out (cleaning.ts); the crew never does.
  const closing = unitsStillClosing(state, occurrence.step);
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isStaff(pool, slot)) continue;
    if (closing.has(pool.homeUnit[slot] as number)) continue;
    if (isOnTrek(pool, slot)) cancelTrek(context, slot);
    stayOutside(pool, slot);
    const unit = staffUnitOf(state, slot);
    if (!unit) continue;
    const arrivalMinute = venueHoursOf(unit).open - drawEarlyMinutes(state);
    pool.trip[slot] = encodeStaffRoutine({ phase: 'outside', entranceOnRight: false });
    pool.dueStep[slot] = occurrence.step + arrivalMinute * STEPS_PER_MINUTE;
  }
  forgetCounts(pool);
}

interface Worker {
  context: StepContext;
  state: TowerState;
  slot: number;
  routine: StaffRoutine;
  unit: Unit & { type: StaffedType };
}

function save(worker: Worker, dueStep: number): void {
  const pool = worker.state.people;
  const wasWorking = staffRoutineAt(pool, worker.slot)?.phase === 'working';
  pool.trip[worker.slot] = encodeStaffRoutine(worker.routine);
  pool.dueStep[worker.slot] = dueStep;
  if (wasWorking !== (worker.routine.phase === 'working')) forgetCounts(pool);
}

/** Puts the person at `from`, then walks them to `to` in `phase`; false, with nothing changed, when there is no route. */
function walk(worker: Worker, phase: StaffPhase, to: Place, from?: Place, outTo?: number): boolean {
  const { state, slot, routine } = worker;
  const pool = state.people;
  const previous = routine.phase;
  const previousLevel = pool.level[slot];
  const previousColumn = pool.column[slot];
  routine.phase = phase;
  if (from) {
    pool.level[slot] = from.level;
    pool.column[slot] = from.column;
  }
  save(worker, NOTHING_DUE);
  if (startTrek(worker.context, slot, to, outTo)) return true;
  routine.phase = previous;
  if (previousLevel !== undefined) pool.level[slot] = previousLevel;
  if (previousColumn !== undefined) pool.column[slot] = previousColumn;
  save(worker, NOTHING_DUE);
  return false;
}

function garbageOf(unit: Unit): number {
  return unit.venue?.garbage ?? 0;
}

/** Whether any cleaning room is built to carry the venues' garbage out. */
function hasCleaningRoom(state: TowerState): boolean {
  return Object.values(state.units).some((unit) => unit.type === 'cleaning-room');
}

function startArrival(worker: Worker): void {
  const { state, unit, routine } = worker;
  const closeStep = closeStepOf(unit, state.step);
  if (state.step >= closeStep) {
    stayOutside(state.people, worker.slot);
    return;
  }
  routine.entranceOnRight = chance(state.rng, 0.5);
  const entrance = entrancePlace(state, routine.entranceOnRight);
  const street = streetPlace(routine.entranceOnRight);
  if (entrance && walk(worker, 'walkingIn', unitPlace(unit), street)) return;
  const retry = state.step + ROUTE_RETRY_STEPS;
  if (retry >= closeStep) stayOutside(state.people, worker.slot);
  else save(worker, retry);
}

function settleWorking(worker: Worker): void {
  const { state, unit, routine } = worker;
  routine.phase = 'working';
  save(worker, Math.max(closeStepOf(unit, state.step), state.step));
}

/** Walks out by the lobby end the worker came in by, or the other one; false when neither can be reached. */
function walkToExit(worker: Worker, phase: StaffPhase): boolean {
  const { state, routine } = worker;
  for (const onRight of [routine.entranceOnRight, !routine.entranceOnRight]) {
    const exit = entrancePlace(state, onRight);
    if (exit && walk(worker, phase, exit, undefined, streetColumn(onRight))) return true;
  }
  return false;
}

/**
 * The shift is over and the worker is out of the tower. One that finishes after midnight missed
 * the 00:00 plan, so today's arrival is planned here.
 */
function finishShift(worker: Worker): void {
  const { state, slot, unit } = worker;
  const pool = state.people;
  stayOutside(pool, slot);
  const dayStart = dayStartOf(state.step);
  if (state.step - dayStart >= 3 * STEPS_PER_HOUR) return;
  const arrival = dayStart + (venueHoursOf(unit).open - drawEarlyMinutes(state)) * STEPS_PER_MINUTE;
  if (arrival <= state.step) return;
  pool.trip[slot] = encodeStaffRoutine({ phase: 'outside', entranceOnRight: false });
  pool.dueStep[slot] = arrival;
}

/**
 * Closing: waits until the last customer has left, then the first worker to get here makes the
 * day's pile of bags and everyone walks out. Only the cleaners carry the bags out.
 */
function startClosing(worker: Worker): void {
  const { state, unit } = worker;
  if (customersInsideVenue(state, unitNumber(unit.id)) > 0) {
    save(worker, state.step + STEPS_PER_MINUTE);
    return;
  }
  const today = Math.floor(state.step / STEPS_PER_DAY);
  let current: Unit = unit;
  if (unit.venue && unit.venue.garbageDay !== today) {
    current = writableUnit(state, unit);
    const venue = current.venue as VenueDay;
    venue.garbage = VENUE_STAFF[unit.type].bags;
    venue.garbageDay = today;
  }
  if (current !== unit && garbageOf(current) > 0 && !hasCleaningRoom(state)) {
    worker.context.events.push(...emitNews(state, 'news.garbageNoCleaning'));
  }
  if (walkToExit(worker, 'leaving')) return;
  worker.routine.phase = 'working';
  save(worker, state.step + ROUTE_RETRY_STEPS);
}

/** At the pile, from a save made when the crew still carried bags: leave it and walk out. */
function arriveAtPile(worker: Worker): void {
  if (!walkToExit(worker, 'leaving')) finishShift(worker);
}

/** At the street with a bag, from a save made when the crew still carried bags: done. */
function arriveWithBag(worker: Worker): void {
  finishShift(worker);
}

function advance(worker: Worker): void {
  switch (worker.routine.phase) {
    case 'outside':
      startArrival(worker);
      break;
    case 'walkingIn':
      settleWorking(worker);
      break;
    case 'working':
      startClosing(worker);
      break;
    case 'toPile':
      arriveAtPile(worker);
      break;
    case 'carrying':
      arriveWithBag(worker);
      break;
    case 'leaving':
      finishShift(worker);
      break;
  }
}

function runWorker(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  if (!isStaff(pool, slot)) return;
  while (pool.dueStep[slot] === state.step) {
    const routine = staffRoutineAt(pool, slot);
    const unit = staffUnitOf(state, slot);
    if (!routine || !unit) {
      stayOutside(pool, slot);
      forgetCounts(pool);
      return;
    }
    advance({ context, state, slot, routine, unit });
  }
}

export interface VenueStaffSystems {
  planHook: ScheduledHook;
  system: SimulationSystem;
}

/** The daily 00:00 crew plan and the system that walks the crews through their day. */
export function createVenueStaff(): VenueStaffSystems {
  return {
    planHook: {
      name: 'venue-staff-plans',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: planDay,
    },
    system: createPeopleSystem(runWorker),
  };
}

/**
 * At 00:00 a fast food takes on the player's switch for the whole day. One that goes inactive
 * loses its crew and its pending customers; one that turns active gets a crew.
 */
export const venueSwitchHook: ScheduledHook = {
  name: 'venue-switch',
  schedule: { every: 'day', hour: 0, minute: 0 },
  run({ state }) {
    const changed = Object.values(state.units).filter(
      (unit) => unit.type === 'fast-food' && unit.activeToday !== unit.enabled,
    );
    for (const shared of changed) {
      const unit = writableUnit(state, shared);
      unit.activeToday = unit.enabled;
      if (unit.activeToday) {
        addCrew(state, unit.id, { planToday: false });
        continue;
      }
      removePeopleOfUnit(state, unit.id);
      if (unit.venue) unit.venue.customers = [];
      forgetCounts(state.people);
    }
  },
};
