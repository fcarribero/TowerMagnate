import { PERSON_KINDS, type PersonPool } from '@tower-magnate/shared';
import { NO_HOME_UNIT, NO_TRIP, NOTHING_DUE, removePerson } from './people';
import { isOnTrek } from './trek';
import type { StepContext } from './step';

export const HOTEL_GUEST_KIND = PERSON_KINDS.indexOf('hotelGuest');

export type GuestPhase =
  | 'arriving'
  | 'arrivalRetry'
  | 'room'
  | 'toExit'
  | 'outside'
  | 'toRoom'
  | 'toVenue'
  | 'atVenue'
  | 'fromVenue'
  | 'leaving'
  | 'leaveRetry';

const PHASES: readonly GuestPhase[] = [
  'arriving',
  'arrivalRetry',
  'room',
  'toExit',
  'outside',
  'toRoom',
  'toVenue',
  'atVenue',
  'fromVenue',
  'leaving',
  'leaveRetry',
];

/** Leave, return and outing of the day. A value is a minute of the day plus one; 0 means none. */
export type GuestSlots = readonly [number, number, number];

export const LEAVE_SLOT = 0;
export const RETURN_SLOT = 1;
export const OUTING_SLOT = 2;
export const NO_SLOT = 0;

/** What one hotel guest is doing, kept in the person's `trip` number (people spec 8). */
export interface GuestRoutine {
  phase: GuestPhase;
  /** Unit number of the venue being visited, or 0. */
  venue: number;
  slots: GuestSlots;
}

const SLOT_RANGE = 1441;
const VENUE_RANGE = 100_000;
const PHASE_RANGE = 12;

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodeGuestRoutine(routine: GuestRoutine): number {
  const [leave, back, outing] = routine.slots;
  let packed = (leave * SLOT_RANGE + back) * SLOT_RANGE + outing;
  packed = packed * VENUE_RANGE + routine.venue;
  return packed * PHASE_RANGE + PHASES.indexOf(routine.phase) + 1;
}

export function decodeGuestRoutine(trip: number): GuestRoutine | null {
  if (trip === NO_TRIP) return null;
  const phase = PHASES[(trip % PHASE_RANGE) - 1];
  if (!phase) return null;
  let rest = Math.floor(trip / PHASE_RANGE);
  const venue = rest % VENUE_RANGE;
  rest = Math.floor(rest / VENUE_RANGE);
  const outing = rest % SLOT_RANGE;
  rest = Math.floor(rest / SLOT_RANGE);
  const back = rest % SLOT_RANGE;
  const leave = Math.floor(rest / SLOT_RANGE);
  if (leave >= SLOT_RANGE) return null;
  return { phase, venue, slots: [leave, back, outing] };
}

export function isHotelGuest(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === HOTEL_GUEST_KIND;
}

export function guestRoutineAt(pool: PersonPool, slot: number): GuestRoutine | null {
  if (!isHotelGuest(pool, slot)) return null;
  return decodeGuestRoutine(pool.trip[slot] ?? NO_TRIP);
}

/** True for a hotel guest inside this venue right now; a guest on the way in does not count. */
export function isGuestAtVenue(pool: PersonPool, slot: number, venue: number): boolean {
  const routine = guestRoutineAt(pool, slot);
  return routine?.phase === 'atVenue' && routine.venue === venue;
}

/** Guests who belong to the room, by person id. */
export function guestsOfRoom(pool: PersonPool, roomNumber: number): number[] {
  const guests: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isHotelGuest(pool, slot) && pool.homeUnit[slot] === roomNumber) {
      guests.push(pool.id[slot] as number);
    }
  }
  return guests;
}

/**
 * At the stay's end the guests stop belonging to the room and give back any parking space (people
 * spec 8.2, 17.2). A guest on the way out keeps walking and leaves at the exit; anyone else is
 * removed at once.
 */
export function releaseStayGuests(context: StepContext, roomNumber: number): void {
  const { state } = context;
  const pool = state.people;
  const removed: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isHotelGuest(pool, slot) || pool.homeUnit[slot] !== roomNumber) continue;
    if (isOnTrek(pool, slot)) {
      pool.homeUnit[slot] = NO_HOME_UNIT;
      Reflect.deleteProperty(state.parking.spaces, pool.id[slot] as number);
      const routine = decodeGuestRoutine(pool.trip[slot] ?? NO_TRIP);
      if (routine) pool.trip[slot] = encodeGuestRoutine({ ...routine, phase: 'leaving' });
      pool.dueStep[slot] = NOTHING_DUE;
    } else {
      removed.push(pool.id[slot] as number);
    }
  }
  for (const personId of removed) removePerson(state, personId);
}
