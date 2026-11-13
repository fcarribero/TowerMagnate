import {
  COURIER_BLOCK_MINUTES,
  COURIER_CHANCE_PER_BLOCK,
  COURIER_DWELL_STEPS,
  COURIER_GIVE_UP_BLOCKS,
  COURIER_HOURS_JITTER_MINUTES,
  COURIER_MARGIN_MINUTES,
  COURIER_OFFICE_CLOSE_MINUTE,
  COURIER_OFFICE_OPEN_MINUTE,
  PERSON_KINDS,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace, unitPlace } from './office-routine';
import {
  addPerson,
  createPeopleSystem,
  NO_TRIP,
  NOTHING_DUE,
  removePerson,
  slotOfPerson,
} from './people';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { cancelTrek, isOnTrek, startTrek, trekPhaseAt } from './trek';
import { unitNumber } from './units';

const COURIER_KIND = PERSON_KINDS.indexOf('courier');

const BLOCK_STEPS = COURIER_BLOCK_MINUTES * STEPS_PER_MINUTE;
const BLOCKS_PER_DAY = STEPS_PER_DAY / BLOCK_STEPS;
/** The first block hook: the earliest any office can start sending (opens early, plus the margin). */
const FIRST_SENDING_MINUTE =
  COURIER_OFFICE_OPEN_MINUTE - COURIER_HOURS_JITTER_MINUTES + COURIER_MARGIN_MINUTES;

type CourierPhase = 'toOffice' | 'atDoor' | 'leaving';
const PHASES: readonly CourierPhase[] = ['toOffice', 'atDoor', 'leaving'];

export interface CourierTrip {
  phase: CourierPhase;
  onRight: boolean;
  /** Absolute block number in which the courier was sent. */
  sentBlock: number;
}

/** What a courier is doing, kept in the person's `trip` number: ((sent block * 2) + side) * 3 + phase + 1. */
export function encodeCourierTrip(trip: CourierTrip): number {
  const side = trip.onRight ? 1 : 0;
  return (trip.sentBlock * 2 + side) * PHASES.length + PHASES.indexOf(trip.phase) + 1;
}

export function courierTripAt(pool: PersonPool, slot: number): CourierTrip | null {
  if (pool.kind[slot] !== COURIER_KIND) return null;
  const packed = pool.trip[slot] ?? NO_TRIP;
  if (packed === NO_TRIP) return null;
  const phase = PHASES[(packed - 1) % PHASES.length];
  if (!phase) return null;
  const rest = Math.floor((packed - 1) / PHASES.length);
  return { phase, onRight: rest % 2 === 1, sentBlock: Math.floor(rest / 2) };
}

/**
 * A pure 32-bit hash of integers, with no RNG state: the same inputs always give the same value,
 * so courier decisions never move the simulation's random stream.
 */
export function keyedHash(...keys: number[]): number {
  let value = 0x9e3779b9;
  for (const key of keys) {
    value = Math.imul(value ^ (key >>> 0), 0x85ebca6b);
    value ^= value >>> 13;
    value = Math.imul(value, 0xc2b2ae35);
    value ^= value >>> 16;
  }
  return value >>> 0;
}

/** A float in [0, 1) from `keyedHash`. */
export function keyedUnit(...keys: number[]): number {
  return keyedHash(...keys) / 0x1_0000_0000;
}

const COURIER_SALT = 0x636f7572;

/** Whether this office wants a courier in this block of this day. Pure: depends on nothing else. */
export function officeWantsCourier(unit: number, day: number, block: number): boolean {
  return keyedUnit(COURIER_SALT, unit, day, block) < COURIER_CHANCE_PER_BLOCK;
}

export interface OfficeHours {
  open: number;
  close: number;
}

/** Minutes of drift, from -jitter to +jitter, that an office has on this day for one end of its hours. */
function hoursDrift(unit: number, day: number, end: number): number {
  const spread = 2 * COURIER_HOURS_JITTER_MINUTES + 1;
  return (
    Math.floor(keyedUnit(COURIER_SALT, unit, day, 1000 + end) * spread) -
    COURIER_HOURS_JITTER_MINUTES
  );
}

/** When this office opens and closes on this day: the nominal hours, a little early or late. */
export function officeHours(unit: number, day: number): OfficeHours {
  return {
    open: COURIER_OFFICE_OPEN_MINUTE + hoursDrift(unit, day, 0),
    close: COURIER_OFFICE_CLOSE_MINUTE + hoursDrift(unit, day, 1),
  };
}

/** True for the minutes in which a courier may be sent: office open, minus the margin at both ends. */
export function isCourierSendingMinute(minuteOfDay: number, hours: OfficeHours): boolean {
  return (
    minuteOfDay >= hours.open + COURIER_MARGIN_MINUTES &&
    minuteOfDay < hours.close - COURIER_MARGIN_MINUTES
  );
}

/** An office is open to deliveries when a tenant has it, on weekdays. */
function isOfficeOpen(unit: Unit, weekday: HookOccurrence['weekday']): boolean {
  return unit.type === 'office' && unit.lease !== null && !isWeekendDay(weekday);
}

function officesWithCouriers(pool: PersonPool): Set<number> {
  const busy = new Set<number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] === COURIER_KIND) busy.add(pool.homeUnit[slot] as number);
  }
  return busy;
}

function setTrip(state: TowerState, slot: number, trip: CourierTrip): void {
  state.people.trip[slot] = encodeCourierTrip(trip);
}

function sendCourier(context: StepContext, unit: Unit, block: number): void {
  const { state } = context;
  const day = Math.floor(state.step / STEPS_PER_DAY);
  const number = unitNumber(unit.id);
  const onRight = keyedHash(COURIER_SALT, number, day, block, 1) % 2 === 1;
  const entrance = entrancePlace(state, onRight);
  if (!entrance) return;
  const personId = addPerson(state, {
    kind: 'courier',
    homeUnit: number,
    level: entrance.level,
    column: entrance.column,
    nameSeed: keyedHash(COURIER_SALT, number, day, block, 2),
  });
  const slot = slotOfPerson(state.people, personId);
  setTrip(state, slot, { phase: 'toOffice', onRight, sentBlock: day * BLOCKS_PER_DAY + block });
  if (!startTrek(context, slot, unitPlace(unit))) removePerson(state, personId);
}

/** Removes couriers that stopped walking, have no route or have been out too long. */
function dropStuckCouriers(context: StepContext, currentBlock: number): void {
  const { state } = context;
  const pool = state.people;
  const gone: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] !== COURIER_KIND) continue;
    const trip = courierTripAt(pool, slot);
    const stranded = trip !== null && trip.phase !== 'atDoor' && !isOnTrek(pool, slot);
    const lost = trekPhaseAt(pool, slot) === 'noRoute';
    const old = trip !== null && currentBlock - trip.sentBlock >= COURIER_GIVE_UP_BLOCKS;
    if (trip === null || stranded || lost || old) gone.push(pool.id[slot] as number);
  }
  for (const personId of gone) {
    const slot = slotOfPerson(pool, personId);
    if (slot >= 0 && isOnTrek(pool, slot)) cancelTrek(context, slot);
    removePerson(state, personId);
  }
}

function rollForCouriers(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const stepOfDay = state.step % STEPS_PER_DAY;
  const block = Math.floor(stepOfDay / BLOCK_STEPS);
  dropStuckCouriers(context, occurrence.dayNumber * BLOCKS_PER_DAY + block);
  const minute = Math.floor(stepOfDay / STEPS_PER_MINUTE);
  const busy = officesWithCouriers(state.people);
  const offices = Object.values(state.units)
    .filter((unit) => isOfficeOpen(unit, occurrence.weekday))
    .filter((unit) =>
      isCourierSendingMinute(minute, officeHours(unitNumber(unit.id), occurrence.dayNumber)),
    )
    .filter((unit) => !busy.has(unitNumber(unit.id)))
    .filter((unit) => officeWantsCourier(unitNumber(unit.id), occurrence.dayNumber, block))
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of offices) sendCourier(context, unit, block);
}

/** Starts the walk back to the entrance the courier came in by; with no way out they leave at once. */
function walkOut(context: StepContext, slot: number, trip: CourierTrip): void {
  const { state } = context;
  const pool = state.people;
  const entrance = entrancePlace(state, trip.onRight);
  setTrip(state, slot, { ...trip, phase: 'leaving' });
  pool.dueStep[slot] = NOTHING_DUE;
  if (!entrance || !startTrek(context, slot, entrance))
    removePerson(state, pool.id[slot] as number);
}

function advanceCourier(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  if (pool.kind[slot] !== COURIER_KIND) return;
  const trip = courierTripAt(pool, slot);
  if (!trip) {
    removePerson(state, pool.id[slot] as number);
    return;
  }
  switch (trip.phase) {
    case 'toOffice': {
      const unitId = `u${pool.homeUnit[slot]}`;
      const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
      if (!unit || unit.type !== 'office') {
        walkOut(context, slot, trip);
        return;
      }
      setTrip(state, slot, { ...trip, phase: 'atDoor' });
      pool.dueStep[slot] = state.step + COURIER_DWELL_STEPS;
      return;
    }
    case 'atDoor':
      walkOut(context, slot, trip);
      return;
    case 'leaving':
      removePerson(state, pool.id[slot] as number);
      return;
  }
}

export interface CourierDemand {
  hooks: ScheduledHook[];
  system: SimulationSystem;
}

/**
 * Couriers (people spec 23): a hook every block rolls each occupied office once inside the sending
 * window and clears stuck couriers; the system walks each courier in, waits at the door and out.
 */
export function createCouriers(): CourierDemand {
  const hooks: ScheduledHook[] = [];
  const lastMinute = COURIER_OFFICE_CLOSE_MINUTE + COURIER_MARGIN_MINUTES;
  for (let minute = FIRST_SENDING_MINUTE; minute <= lastMinute; minute += COURIER_BLOCK_MINUTES) {
    hooks.push({
      name: `courier-block-${minute}`,
      schedule: { every: 'day', hour: Math.floor(minute / 60), minute: minute % 60 },
      run: rollForCouriers,
    });
  }
  return { hooks, system: createPeopleSystem(advanceCourier) };
}
