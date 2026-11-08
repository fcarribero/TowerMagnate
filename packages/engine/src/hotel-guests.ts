import {
  HOTEL_BOOKING_CHANCE,
  HOTEL_BOOKING_ROLL_MINUTE,
  HOTEL_CHECK_IN_OUTING_CHANCE,
  HOTEL_CHECK_IN_OUTING_DELAY_MINUTES,
  HOTEL_CHECK_OUT_LEAVE,
  HOTEL_DAY_OUT_CHANCE,
  HOTEL_DAY_OUT_LEAVE,
  HOTEL_DAY_OUT_RETURN,
  HOTEL_EVENING_OUTING,
  HOTEL_EVENING_OUTING_CHANCE,
  HOTEL_GIVE_UP_MINUTE,
  HOTEL_LAST_ARRIVAL_MINUTE,
  HOTEL_LATE_ARRIVAL_DELAY_MINUTES,
  HOTEL_LATE_ROLL_BEFORE_MINUTE,
  HOTEL_NOON_ARRIVAL,
  HOTEL_OUTING_END_MINUTE,
  HOTEL_OUTING_VENUES,
  HOTEL_PARTY_SIZE,
  ROUTE_RETRY_STEPS,
  VENUE_VISIT_MINUTES,
  type HotelRoom,
  type TowerState,
  type Unit,
  type VisitedVenueType,
  type WindowPart,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { checkIn } from './hotel';
import {
  decodeGuestRoutine,
  encodeGuestRoutine,
  guestRoutineAt,
  guestsOfRoom,
  isHotelGuest,
  LEAVE_SLOT,
  NO_SLOT,
  OUTING_SLOT,
  RETURN_SLOT,
  type GuestPhase,
  type GuestRoutine,
  type GuestSlots,
} from './hotel-guest-trip';
import { entrancePlace, unitPlace, type Place, type RoutePlanner } from './office-routine';
import {
  addPerson,
  createPeopleSystem,
  NO_HOME_UNIT,
  NO_TRIP,
  NOTHING_DUE,
  removePerson,
  rollParkingHolder,
  slotOfPerson,
} from './people';
import { chooseVenue, hasVenueCandidate, isVenueOpen, venueHasRoom } from './resident-routine';
import { chance, nextInt } from './rng';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { drawMinuteFromWindow } from './time-windows';
import { cancelTrek, isOnTrek, plannedTripSteps, startTrek } from './trek';
import { stressOfTripEndedNow } from './trip-ledger';
import { fileShopVisit, fileUnitTrip } from './unit-evaluation';
import { unitNumber } from './units';
import { countVenueVisit } from './venues';

type RoomType = keyof typeof HOTEL_PARTY_SIZE;
type RoomUnit = Unit & { type: RoomType; hotel: HotelRoom };

const routes: RoutePlanner = (_state, from, to, context) => plannedTripSteps(context, from, to);

function isRoom(unit: Unit | undefined): unit is RoomUnit {
  return unit !== undefined && unit.type in HOTEL_PARTY_SIZE && unit.hotel !== null;
}

function roomsById(state: TowerState, keep: (room: RoomUnit) => boolean = () => true): RoomUnit[] {
  const rooms: RoomUnit[] = [];
  for (const unit of Object.values(state.units)) {
    if (isRoom(unit) && keep(unit)) rooms.push(unit);
  }
  return rooms.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

function roomOf(state: TowerState, roomNumber: number): RoomUnit | null {
  if (roomNumber === NO_HOME_UNIT) return null;
  const unit = state.units[`u${roomNumber}`];
  return isRoom(unit) ? unit : null;
}

function dayStartOf(step: number): number {
  return step - (step % STEPS_PER_DAY);
}

function minuteOfDay(step: number): number {
  return Math.floor((step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

/** The first whole minute of the day at or after `step`. */
function minuteAtOrAfter(step: number): number {
  return Math.ceil((step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function stepOfSlot(dayStart: number, slotValue: number): number {
  return dayStart + (slotValue - 1) * STEPS_PER_MINUTE;
}

function windowSlot(state: TowerState, parts: readonly WindowPart[]): number {
  return drawMinuteFromWindow(state.rng, parts) + 1;
}

/** A room takes a booking only when it is clean, with no stay and no booking (people spec 8.1). */
function canTakeBooking(room: RoomUnit): boolean {
  const { hotel } = room;
  return hotel.state === 'clean' && hotel.stayEndStep === null && hotel.arrivalStep === null;
}

/** People spec 8.1: a 12:00 booking draws from the noon window, a later one after a 30 minute delay. */
function drawArrivalStep(state: TowerState, atNoon: boolean): number | null {
  const dayStart = dayStartOf(state.step);
  if (atNoon)
    return dayStart + drawMinuteFromWindow(state.rng, HOTEL_NOON_ARRIVAL) * STEPS_PER_MINUTE;
  const first = minuteAtOrAfter(state.step) + HOTEL_LATE_ARRIVAL_DELAY_MINUTES;
  if (first >= HOTEL_LAST_ARRIVAL_MINUTE) return null;
  return dayStart + nextInt(state.rng, first, HOTEL_LAST_ARRIVAL_MINUTE - 1) * STEPS_PER_MINUTE;
}

function rollBooking(state: TowerState, room: RoomUnit, atNoon: boolean): void {
  room.hotel.rollDue = false;
  const odds = HOTEL_BOOKING_CHANCE[room.evaluation ?? 'none'];
  if (!chance(state.rng, odds)) return;
  room.hotel.arrivalStep = drawArrivalStep(state, atNoon);
}

/** People spec 8.1: at 12:00 every room that can take a booking rolls once, in unit id order. */
function rollNoonBookings(context: StepContext): void {
  for (const room of roomsById(context.state)) {
    if (canTakeBooking(room)) rollBooking(context.state, room, true);
    else room.hotel.rollDue = false;
  }
}

/**
 * A room that became clean rolls at that step between 12:00 and 21:00. Outside those hours it
 * keeps the flag, and the next 12:00 roll takes it with the other rooms.
 */
function rollFreshlyCleanRooms(state: TowerState): void {
  const minute = minuteOfDay(state.step);
  if (minute < HOTEL_BOOKING_ROLL_MINUTE || minute >= HOTEL_LATE_ROLL_BEFORE_MINUTE) return;
  for (const room of roomsById(state, (room) => room.hotel.rollDue)) {
    if (canTakeBooking(room)) rollBooking(state, room, false);
    else room.hotel.rollDue = false;
  }
}

function save(state: TowerState, slot: number, routine: GuestRoutine, dueStep: number): void {
  state.people.trip[slot] = encodeGuestRoutine(routine);
  state.people.dueStep[slot] = dueStep;
}

function standAt(state: TowerState, slot: number, place: Place): void {
  state.people.level[slot] = place.level;
  state.people.column[slot] = place.column;
}

/** The whole party appears at one entrance and walks to the room (people spec 8.1). */
function sendParty(context: StepContext, room: RoomUnit): void {
  const { state } = context;
  const entrance = entrancePlace(state, chance(state.rng, 0.5));
  if (!entrance) return;
  const roomNumber = unitNumber(room.id);
  for (let index = 0; index < HOTEL_PARTY_SIZE[room.type]; index++) {
    const personId = addPerson(state, {
      kind: 'hotelGuest',
      homeUnit: roomNumber,
      level: entrance.level,
      column: entrance.column,
    });
    if (index === 0 && room.type === 'suite') rollParkingHolder(state, personId, 'suite');
    const slot = slotOfPerson(state.people, personId);
    const routine: GuestRoutine = {
      phase: 'arriving',
      venue: 0,
      slots: [NO_SLOT, NO_SLOT, NO_SLOT],
    };
    save(state, slot, routine, NOTHING_DUE);
    if (!startTrek(context, slot, unitPlace(room))) {
      save(state, slot, { ...routine, phase: 'arrivalRetry' }, state.step + ROUTE_RETRY_STEPS);
    }
  }
}

function sendDueParties(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const arriving = roomsById(state, (room) => room.hotel.arrivalStep === state.step);
  for (const room of arriving) {
    if (canTakeArrival(room)) sendParty(context, room);
  }
}

function canTakeArrival(room: RoomUnit): boolean {
  return room.hotel.state === 'clean' && room.hotel.stayEndStep === null;
}

function removeParty(state: TowerState, room: RoomUnit): void {
  room.hotel.arrivalStep = null;
  for (const personId of guestsOfRoom(state.people, unitNumber(room.id))) {
    removePerson(state, personId);
  }
}

/** People spec 8.1: a booked party with nobody in the room at 23:00 leaves without paying. */
function giveUpLateParties(context: StepContext): void {
  const booked = roomsById(context.state, (room) => room.hotel.arrivalStep !== null);
  for (const room of booked) {
    if (room.hotel.stayEndStep === null) removeParty(context.state, room);
  }
}

/** The pending intention with the earliest time, or null when the day's plan is used up. */
function nextIntention(slots: GuestSlots): { index: number; slotValue: number } | null {
  let best: { index: number; slotValue: number } | null = null;
  slots.forEach((slotValue, index) => {
    if (slotValue === NO_SLOT) return;
    if (best === null || slotValue < best.slotValue) best = { index, slotValue };
  });
  return best;
}

function withSlot(slots: GuestSlots, index: number, value: number): GuestSlots {
  const next: [number, number, number] = [slots[0], slots[1], slots[2]];
  next[index] = value;
  return next;
}

/**
 * The guest is in the room with nothing running. Intentions whose time passed while they were
 * away are skipped (people spec 8.2); then they wait for the next one.
 */
function settleInRoom(
  state: TowerState,
  slot: number,
  room: RoomUnit,
  routine: GuestRoutine,
): void {
  standAt(state, slot, unitPlace(room));
  const dayStart = dayStartOf(state.step);
  let slots = routine.slots;
  let next = nextIntention(slots);
  while (next && stepOfSlot(dayStart, next.slotValue) < state.step) {
    slots = withSlot(slots, next.index, NO_SLOT);
    next = nextIntention(slots);
  }
  const dueStep = next ? stepOfSlot(dayStart, next.slotValue) : NOTHING_DUE;
  save(state, slot, { phase: 'room', venue: 0, slots }, dueStep);
}

/** Files again the trips of the party that ended at the check-in step; check-in cleared the ledger. */
function fileArrivalTrips(state: TowerState, room: RoomUnit): void {
  for (const personId of guestsOfRoom(state.people, unitNumber(room.id))) {
    const slot = slotOfPerson(state.people, personId);
    const stress = stressOfTripEndedNow(state, slot);
    if (stress !== null) fileUnitTrip(state, room, state.step, stress);
  }
}

/** People spec 8.2: on the check-in day each guest goes out once with 40% chance. */
function drawCheckInOutings(state: TowerState, room: RoomUnit): void {
  const first = minuteAtOrAfter(state.step) + HOTEL_CHECK_IN_OUTING_DELAY_MINUTES;
  if (first >= HOTEL_OUTING_END_MINUTE) return;
  for (const personId of guestsOfRoom(state.people, unitNumber(room.id))) {
    const slot = slotOfPerson(state.people, personId);
    const routine = guestRoutineAt(state.people, slot);
    if (!routine || !chance(state.rng, HOTEL_CHECK_IN_OUTING_CHANCE)) continue;
    const minute = nextInt(state.rng, first, HOTEL_OUTING_END_MINUTE - 1);
    const slots = withSlot(routine.slots, OUTING_SLOT, minute + 1);
    state.people.trip[slot] = encodeGuestRoutine({ ...routine, slots });
  }
}

/** Check-in happens when the first guest of the party reaches the room (economy 5.2). */
function arriveAtRoom(context: StepContext, slot: number, room: RoomUnit): void {
  const { state } = context;
  const personId = state.people.id[slot] as number;
  if (room.hotel.arrivalStep !== null && room.hotel.state === 'clean') {
    if (!checkIn(context, room.id).checkedIn) {
      removeParty(state, room);
      return;
    }
    fileArrivalTrips(state, room);
    drawCheckInOutings(state, room);
  }
  if (room.hotel.stayEndStep === null) {
    removePerson(state, personId);
    return;
  }
  settleInRoom(state, slot, room, guestRoutineAt(state.people, slot) as GuestRoutine);
}

interface Guest {
  context: StepContext;
  state: TowerState;
  slot: number;
  room: RoomUnit;
  routine: GuestRoutine;
}

function travel(guest: Guest, phase: GuestPhase, from: Place, to: Place): boolean {
  const { state, slot, routine } = guest;
  standAt(state, slot, from);
  save(state, slot, { ...routine, phase }, NOTHING_DUE);
  if (startTrek(guest.context, slot, to)) return true;
  state.people.trip[slot] = encodeGuestRoutine(routine);
  return false;
}

function settle(guest: Guest): void {
  settleInRoom(guest.state, guest.slot, guest.room, guest.routine);
}

function retryLater(guest: Guest, phase: GuestPhase): void {
  save(guest.state, guest.slot, { ...guest.routine, phase }, guest.state.step + ROUTE_RETRY_STEPS);
}

function isCheckOutDay(guest: Guest): boolean {
  const stayEnd = guest.room.hotel.stayEndStep;
  return stayEnd !== null && dayStartOf(stayEnd) === dayStartOf(guest.state.step);
}

/** Leaving the hotel at the end of the stay is required, so with no route it is tried again. */
function startDeparture(guest: Guest): void {
  const { state } = guest;
  const exit = entrancePlace(state, chance(state.rng, 0.5));
  if (exit && travel(guest, 'leaving', currentPlace(guest), exit)) return;
  retryLater(guest, 'leaveRetry');
}

function currentPlace(guest: Guest): Place {
  const pool = guest.state.people;
  return {
    level: pool.level[guest.slot] as Place['level'],
    column: pool.column[guest.slot] as number,
  };
}

/** A guest who cannot get out for the day stays in and skips the return as well. */
function startDayOut(guest: Guest): void {
  const { state } = guest;
  const exit = entrancePlace(state, chance(state.rng, 0.5));
  if (exit && travel(guest, 'toExit', unitPlace(guest.room), exit)) return;
  guest.routine.slots = withSlot(guest.routine.slots, RETURN_SLOT, NO_SLOT);
  settle(guest);
}

/** The way back to the room is required, so with no route it is tried again later. */
function startReturn(guest: Guest): void {
  const { state } = guest;
  const entrance = entrancePlace(state, chance(state.rng, 0.5));
  if (entrance && travel(guest, 'toRoom', entrance, unitPlace(guest.room))) return;
  retryLater(guest, 'outside');
}

function finishExit(guest: Guest): void {
  const returnSlot = guest.routine.slots[RETURN_SLOT];
  guest.routine.slots = withSlot(guest.routine.slots, RETURN_SLOT, NO_SLOT);
  const dueStep =
    returnSlot === NO_SLOT
      ? NOTHING_DUE
      : Math.max(stepOfSlot(dayStartOf(guest.state.step), returnSlot), guest.state.step);
  save(guest.state, guest.slot, { ...guest.routine, phase: 'outside' }, dueStep);
}

const OUTING_TYPES = HOTEL_OUTING_VENUES.map(({ type }) => type);

function drawOutingType(state: TowerState): VisitedVenueType {
  const total = HOTEL_OUTING_VENUES.reduce((sum, { weight }) => sum + weight, 0);
  let roll = nextInt(state.rng, 1, total);
  for (const { type, weight } of HOTEL_OUTING_VENUES) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return OUTING_TYPES[OUTING_TYPES.length - 1] as VisitedVenueType;
}

/** People spec 5: the drawn type first, then the other types by weight while it has no candidate. */
function outingTypeWithCandidates(state: TowerState): VisitedVenueType | null {
  const drawn = drawOutingType(state);
  const order = [drawn, ...OUTING_TYPES.filter((type) => type !== drawn)];
  return order.find((type) => hasVenueCandidate(state, type)) ?? null;
}

function startOuting(guest: Guest): void {
  const type = outingTypeWithCandidates(guest.state);
  const from = unitPlace(guest.room);
  const choice = type ? chooseVenue(guest.context, routes, from, type) : null;
  if (!choice) {
    settle(guest);
    return;
  }
  guest.routine.venue = unitNumber(choice.unit.id);
  if (!travel(guest, 'toVenue', from, unitPlace(choice.unit))) {
    guest.routine.venue = 0;
    settle(guest);
  }
}

function startIntention(guest: Guest): void {
  const next = nextIntention(guest.routine.slots);
  if (!next) {
    settle(guest);
    return;
  }
  guest.routine.slots = withSlot(guest.routine.slots, next.index, NO_SLOT);
  if (next.index === LEAVE_SLOT) {
    if (isCheckOutDay(guest)) startDeparture(guest);
    else startDayOut(guest);
  } else if (next.index === OUTING_SLOT) {
    startOuting(guest);
  } else {
    settle(guest);
  }
}

function venueOf(state: TowerState, venue: number): Unit | null {
  return state.units[`u${venue}`] ?? null;
}

/**
 * The way back to the room is required. With no route the guest waits where they stand, no longer
 * inside any venue, and tries again later.
 */
function walkBack(guest: Guest, from: Place): void {
  guest.routine.venue = 0;
  if (!travel(guest, 'fromVenue', from, unitPlace(guest.room))) {
    retryLater(guest, 'atVenue');
  }
}

/** The guest reached the venue: go in if it is still open and has room, otherwise walk back. */
function arriveAtVenue(guest: Guest): void {
  const { state, routine } = guest;
  const venue = venueOf(state, routine.venue);
  if (venue) fileShopVisit(state, venue, state.people.id[guest.slot] as number);
  const type = venue?.type as VisitedVenueType | undefined;
  const minute = minuteOfDay(state.step);
  if (!venue || !type || !isVenueOpen(type, minute) || !venueHasRoom(state, venue, type)) {
    walkBack(guest, venue ? unitPlace(venue) : unitPlace(guest.room));
    return;
  }
  standAt(state, guest.slot, unitPlace(venue));
  countVenueVisit(state, venue, stressOfTripEndedNow(state, guest.slot));
  const stayEnds = state.step + VENUE_VISIT_MINUTES[type] * STEPS_PER_MINUTE;
  save(state, guest.slot, { ...routine, phase: 'atVenue' }, stayEnds);
}

function advance(guest: Guest): void {
  const { routine, state, slot, room } = guest;
  switch (routine.phase) {
    case 'arriving':
      arriveAtRoom(guest.context, slot, room);
      break;
    case 'arrivalRetry':
      if (!travel(guest, 'arriving', currentPlace(guest), unitPlace(room))) {
        retryLater(guest, 'arrivalRetry');
      }
      break;
    case 'room':
      startIntention(guest);
      break;
    case 'toExit':
      finishExit(guest);
      break;
    case 'outside':
      startReturn(guest);
      break;
    case 'toRoom':
    case 'fromVenue':
      settle(guest);
      break;
    case 'toVenue':
      arriveAtVenue(guest);
      break;
    case 'atVenue':
      walkBack(guest, currentPlace(guest));
      break;
    case 'leaving':
      removePerson(state, state.people.id[slot] as number);
      break;
    case 'leaveRetry':
      startDeparture(guest);
      break;
  }
}

function runGuest(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  if (!isHotelGuest(pool, slot)) return;
  const personId = pool.id[slot];
  while (pool.id[slot] === personId && pool.dueStep[slot] === state.step) {
    const routine = decodeGuestRoutine(pool.trip[slot] ?? NO_TRIP);
    const room = roomOf(state, pool.homeUnit[slot] as number);
    if (!routine || !room) {
      removePerson(state, personId as number);
      return;
    }
    advance({ context, state, slot, room, routine });
  }
}

function drawDayPlan(state: TowerState, checkOutDay: boolean): GuestSlots {
  if (checkOutDay) return [windowSlot(state, HOTEL_CHECK_OUT_LEAVE), NO_SLOT, NO_SLOT];
  let leave = NO_SLOT;
  let back = NO_SLOT;
  if (chance(state.rng, HOTEL_DAY_OUT_CHANCE)) {
    leave = windowSlot(state, HOTEL_DAY_OUT_LEAVE);
    back = windowSlot(state, HOTEL_DAY_OUT_RETURN);
  }
  const outing = chance(state.rng, HOTEL_EVENING_OUTING_CHANCE)
    ? windowSlot(state, HOTEL_EVENING_OUTING)
    : NO_SLOT;
  return [leave, back, outing];
}

/** People spec 1.3 and 8.2: at 00:00 each guest whose stay continues today draws a plan. */
function drawPlans(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isHotelGuest(pool, slot)) continue;
    const room = roomOf(state, pool.homeUnit[slot] as number);
    const stayEnd = room?.hotel.stayEndStep ?? null;
    if (!room || stayEnd === null) continue;
    if (isOnTrek(pool, slot)) cancelTrek(context, slot);
    const checkOutDay = dayStartOf(stayEnd) === dayStartOf(state.step);
    const slots = drawDayPlan(state, checkOutDay);
    settleInRoom(state, slot, room, { phase: 'room', venue: 0, slots });
  }
}

/**
 * People spec 4.1: at 03:00 guests still on a trip go back to their room, and anyone whose stay
 * has ended leaves the simulation.
 */
function sendGuestsToRooms(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  const leaving: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isHotelGuest(pool, slot)) continue;
    const room = roomOf(state, pool.homeUnit[slot] as number);
    const routine = guestRoutineAt(pool, slot);
    if (!room || room.hotel.stayEndStep === null || !routine) {
      leaving.push(pool.id[slot] as number);
      continue;
    }
    if (routine.phase === 'room') continue;
    if (isOnTrek(pool, slot)) cancelTrek(context, slot);
    settleInRoom(state, slot, room, { ...routine, venue: 0 });
  }
  for (const personId of leaving) removePerson(state, personId);
}

export interface HotelGuestSystems {
  planHook: ScheduledHook;
  nightHook: ScheduledHook;
  bookingHook: ScheduledHook;
  giveUpHook: ScheduledHook;
  /** Late booking rolls, party arrivals and every guest's day. */
  system: SimulationSystem;
}

/** Hotel bookings, parties and the days of a stay (people spec 8). */
export function createHotelGuests(): HotelGuestSystems {
  const walk = createPeopleSystem(runGuest);
  const giveUpHour = Math.floor(HOTEL_GIVE_UP_MINUTE / 60);
  return {
    planHook: {
      name: 'hotel-guest-plans',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: drawPlans,
    },
    nightHook: {
      name: 'hotel-guest-night',
      schedule: { every: 'day', hour: 3, minute: 0 },
      run: sendGuestsToRooms,
    },
    bookingHook: {
      name: 'hotel-booking-rolls',
      schedule: {
        every: 'day',
        hour: Math.floor(HOTEL_BOOKING_ROLL_MINUTE / 60),
        minute: HOTEL_BOOKING_ROLL_MINUTE % 60,
      },
      run: rollNoonBookings,
    },
    giveUpHook: {
      name: 'hotel-party-give-up',
      schedule: { every: 'day', hour: giveUpHour, minute: HOTEL_GIVE_UP_MINUTE % 60 },
      run: giveUpLateParties,
    },
    system: (context) => {
      rollFreshlyCleanRooms(context.state);
      sendDueParties(context);
      walk(context);
    },
  };
}
