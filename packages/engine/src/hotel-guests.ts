import {
  HOTEL_BOOKING_ROLL_MINUTE,
  HOTEL_CHECK_IN_OUTING_CHANCE,
  HOTEL_CHECK_IN_OUTING_DELAY_MINUTES,
  HOTEL_BED,
  HOTEL_BED_AFTER_ARRIVAL_MINUTES,
  HOTEL_CHECK_OUT_LEAVE,
  HOTEL_DAY_OUT_CHANCE,
  HOTEL_DAY_OUT_LEAVE,
  HOTEL_DAY_OUT_RETURN,
  HOTEL_EVENING_OUTING,
  HOTEL_EVENING_OUTING_CHANCE,
  HOTEL_FIRST_ARRIVAL_MINUTE,
  HOTEL_GIVE_UP_MINUTE,
  HOTEL_LAST_ARRIVAL_MINUTE,
  HOTEL_LATE_ARRIVAL_DELAY_MINUTES,
  HOTEL_LATE_ROLL_BEFORE_MINUTE,
  HOTEL_NOON_ARRIVAL,
  HOTEL_OUTING_END_MINUTE,
  HOTEL_OUTING_VENUES,
  HOTEL_PARTY_SIZE,
  HOTEL_WAKE,
  ROUTE_RETRY_STEPS,
  VENUE_VISIT_MINUTES,
  VIP_LEAVE,
  VIP_NIGHTS,
  type HotelRoom,
  type PersonPool,
  type TowerState,
  type Unit,
  type UnitId,
  type VisitedVenueType,
  type WindowPart,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { isVipBooking, vipLeftTower } from './events/vip';
import { checkIn, rollBooking } from './hotel';
import {
  decodeGuestRoutine,
  encodeGuestRoutine,
  guestRoutineAt,
  guestsOfRoom,
  isHotelGuest,
  isVip,
  LEAVE_SLOT,
  NO_SLOT,
  OUTING_SLOT,
  RETURN_SLOT,
  type GuestPhase,
  type GuestRoutine,
  type GuestSlots,
} from './hotel-guest-trip';
import { entrancePlace, unitPlace, type Place, type RoutePlanner } from './office-routine';
import { drawEntrance, entranceDoor, streetEntrance, subwayStation } from './outside-entrances';
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
import { assignParking } from './parking';
import { chooseVenue, hasVenueCandidate, isVenueOpen, venueHasRoom } from './resident-routine';
import { chance, nextInt } from './rng';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { drawBedStep, drawWakeDelay, drawWakeStep, type SleepWindows } from './sleep';
import { drawMinuteFromWindow } from './time-windows';
import { cancelTrek, isOnTrek, plannedTripSteps, startTrek } from './trek';
import { stressOfTripEndedNow } from './trip-ledger';
import { fileShopVisit, fileUnitTrip } from './unit-evaluation';
import { unitNumber } from './units';
import type { CustomerEntrance } from './venue-visitors';
import { countVenueVisit } from './venues';

type RoomType = keyof typeof HOTEL_PARTY_SIZE;
type RoomUnit = Unit & { type: RoomType; hotel: HotelRoom };

const BED_WINDOWS: SleepWindows = { usual: HOTEL_BED, long: HOTEL_BED };
const WAKE_WINDOWS: SleepWindows = { usual: HOTEL_WAKE, long: HOTEL_WAKE };

const routes: RoutePlanner = (_state, from, to, context) => plannedTripSteps(context, from, to);

function isRoom(unit: Unit | undefined): unit is RoomUnit {
  return unit !== undefined && unit.hotel !== null && unit.type in HOTEL_PARTY_SIZE;
}

const NO_ROOMS: readonly RoomUnit[] = [];

/** Runs on most steps, so it walks the units without building a list unless a room matches. */
function roomsById(
  state: TowerState,
  keep: (room: RoomUnit) => boolean = () => true,
): readonly RoomUnit[] {
  let rooms: RoomUnit[] | null = null;
  for (const id in state.units) {
    const unit = state.units[id as UnitId];
    if (!isRoom(unit) || !keep(unit)) continue;
    rooms ??= [];
    rooms.push(unit);
  }
  if (rooms === null) return NO_ROOMS;
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
  const first = Math.max(
    minuteAtOrAfter(state.step) + HOTEL_LATE_ARRIVAL_DELAY_MINUTES,
    HOTEL_FIRST_ARRIVAL_MINUTE,
  );
  if (first >= HOTEL_LAST_ARRIVAL_MINUTE) return null;
  return dayStart + nextInt(state.rng, first, HOTEL_LAST_ARRIVAL_MINUTE - 1) * STEPS_PER_MINUTE;
}

function clearRollDue(state: TowerState, room: RoomUnit): void {
  if (room.hotel.rollDue) writableUnit(state, room).hotel.rollDue = false;
}

function rollForBooking(state: TowerState, shared: RoomUnit, atNoon: boolean): void {
  const room = writableUnit(state, shared);
  room.hotel.rollDue = false;
  if (!rollBooking(state.rng, room)) return;
  room.hotel.arrivalStep = drawArrivalStep(state, atNoon);
}

/** People spec 8.1: at 12:00 every room that can take a booking rolls once, in unit id order. */
function rollNoonBookings(context: StepContext): void {
  for (const room of roomsById(context.state)) {
    if (canTakeBooking(room)) rollForBooking(context.state, room, true);
    else clearRollDue(context.state, room);
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
    if (canTakeBooking(room)) rollForBooking(state, room, false);
    else clearRollDue(state, room);
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

/** People spec 3: a guest with a parking space never takes the subway. Neither does the VIP (spec 9). */
function drawGuestEntrance(state: TowerState, personId: number): CustomerEntrance {
  const hasSpace = (state.parking.spaces[personId] ?? 0) > 0;
  const vip = isVip(state.people, slotOfPerson(state.people, personId));
  return drawEntrance(state, hasSpace || vip ? null : subwayStation(state));
}

/** The whole party appears at one entrance and walks to the room (people spec 8.1). */
function sendParty(context: StepContext, room: RoomUnit): void {
  const { state } = context;
  const entrance = drawEntrance(state, subwayStation(state));
  if (!entranceDoor(state, entrance)) return;
  for (let index = 0; index < HOTEL_PARTY_SIZE[room.type]; index++) {
    const personId = sendGuest(context, room, 'hotelGuest', entrance);
    if (index === 0 && room.type === 'suite') rollParkingHolder(state, personId, 'suite');
  }
}

/** People spec 9: the VIP comes alone through the street entrance and never parks. */
function sendVip(context: StepContext, room: RoomUnit): void {
  const { state } = context;
  const entrance = streetEntrance(state);
  const visit = state.vipVisit;
  if (!entranceDoor(state, entrance) || !visit) return;
  visit.personId = sendGuest(context, room, 'vip', entrance);
}

function sendGuest(
  context: StepContext,
  room: RoomUnit,
  kind: 'hotelGuest' | 'vip',
  entrance: CustomerEntrance,
): number {
  const { state } = context;
  const door = entranceDoor(state, entrance) as Place;
  const personId = addPerson(state, {
    kind,
    homeUnit: unitNumber(room.id),
    level: door.level,
    column: door.column,
  });
  const slot = slotOfPerson(state.people, personId);
  const routine: GuestRoutine = {
    phase: 'arriving',
    venue: 0,
    slots: [NO_SLOT, NO_SLOT, NO_SLOT],
  };
  save(state, slot, routine, NOTHING_DUE);
  const guest: Guest = { context, state, slot, room, routine };
  if (!walkIn(guest, 'arriving', entrance)) {
    save(state, slot, { ...routine, phase: 'arrivalRetry' }, state.step + ROUTE_RETRY_STEPS);
  }
  return personId;
}

function sendDueParties(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const arriving = roomsById(state, (room) => room.hotel.arrivalStep === state.step);
  for (const room of arriving) {
    if (!canTakeArrival(room)) continue;
    if (isVipBooking(state, room.id)) sendVip(context, room);
    else sendParty(context, room);
  }
}

function canTakeArrival(room: RoomUnit): boolean {
  return room.hotel.state === 'clean' && room.hotel.stayEndStep === null;
}

function removeParty(state: TowerState, room: RoomUnit): void {
  writableUnit(state, room).hotel.arrivalStep = null;
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
 * away are skipped (people spec 8.2); then they wait for the next one. With none left, or when
 * `bedFirst` is set, they wait for a bed time drawn now, no sooner than `bedAfter` steps from now.
 */
function settleInRoom(
  state: TowerState,
  slot: number,
  room: RoomUnit,
  routine: GuestRoutine,
  options: { bedFirst?: boolean; bedAfter?: number } = {},
): void {
  standAt(state, slot, unitPlace(room));
  const dayStart = dayStartOf(state.step);
  let slots = routine.slots;
  let next = nextIntention(slots);
  while (next && stepOfSlot(dayStart, next.slotValue) < state.step) {
    slots = withSlot(slots, next.index, NO_SLOT);
    next = nextIntention(slots);
  }
  const bedTime = () => drawBedStep(state, state.step + (options.bedAfter ?? 0), BED_WINDOWS);
  const dueStep = next && !options.bedFirst ? stepOfSlot(dayStart, next.slotValue) : bedTime();
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

/**
 * People spec 8.2: on the check-in day each guest goes out once with 40% chance. The VIP always
 * plans the restaurant (people spec 9).
 */
function drawCheckInOutings(state: TowerState, room: RoomUnit): void {
  const first = minuteAtOrAfter(state.step) + HOTEL_CHECK_IN_OUTING_DELAY_MINUTES;
  if (first >= HOTEL_OUTING_END_MINUTE) return;
  for (const personId of guestsOfRoom(state.people, unitNumber(room.id))) {
    const slot = slotOfPerson(state.people, personId);
    const routine = guestRoutineAt(state.people, slot);
    if (!routine) continue;
    if (!isVip(state.people, slot) && !chance(state.rng, HOTEL_CHECK_IN_OUTING_CHANCE)) continue;
    const minute = nextInt(state.rng, first, HOTEL_OUTING_END_MINUTE - 1);
    const slots = withSlot(routine.slots, OUTING_SLOT, minute + 1);
    state.people.trip[slot] = encodeGuestRoutine({ ...routine, slots });
  }
}

function partyHoldsParking(state: TowerState, room: RoomUnit): boolean {
  return guestsOfRoom(state.people, unitNumber(room.id)).some((personId) =>
    Object.hasOwn(state.parking.spaces, personId),
  );
}

/** People spec 17.2: a suite holder gets a space at check-in, not only at the 06:00 pass. */
function assignSuiteParking(context: StepContext, room: RoomUnit): void {
  if (room.type === 'suite' && partyHoldsParking(context.state, room)) assignParking(context);
}

/** Check-in happens when the first guest of the party reaches the room (economy 5.2). */
function arriveAtRoom(context: StepContext, slot: number, arrivedAt: RoomUnit): void {
  const { state } = context;
  const personId = state.people.id[slot] as number;
  if (arrivedAt.hotel.arrivalStep !== null && arrivedAt.hotel.state === 'clean') {
    const nights = isVip(state.people, slot) ? VIP_NIGHTS : undefined;
    if (!checkIn(context, arrivedAt.id, nights).checkedIn) {
      removeParty(state, arrivedAt);
      return;
    }
    fileArrivalTrips(state, arrivedAt);
    drawCheckInOutings(state, arrivedAt);
    assignSuiteParking(context, arrivedAt);
  }
  const room = state.units[arrivedAt.id] as RoomUnit;
  if (room.hotel.stayEndStep === null) {
    removePerson(state, personId);
    return;
  }
  settleInRoom(state, slot, room, guestRoutineAt(state.people, slot) as GuestRoutine, {
    bedAfter: HOTEL_BED_AFTER_ARRIVAL_MINUTES * STEPS_PER_MINUTE,
  });
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

function travelFrom(guest: Guest, phase: GuestPhase, entrance: CustomerEntrance): boolean {
  const door = entranceDoor(guest.state, entrance);
  return door !== null && travel(guest, phase, door, unitPlace(guest.room));
}

/** Walks in from the entrance to the room; with no route from the subway, from the street at once. */
function walkIn(guest: Guest, phase: GuestPhase, entrance: CustomerEntrance): boolean {
  if (travelFrom(guest, phase, entrance)) return true;
  return entrance.kind === 'subway' && travelFrom(guest, phase, streetEntrance(guest.state));
}

function travelTo(
  guest: Guest,
  phase: GuestPhase,
  from: Place,
  entrance: CustomerEntrance,
): boolean {
  const door = entranceDoor(guest.state, entrance);
  return door !== null && travel(guest, phase, from, door);
}

/** Walks out to a drawn entrance; with no route to the subway, to the street at once. */
function walkOut(guest: Guest, phase: GuestPhase, from: Place): boolean {
  const { state } = guest;
  const entrance = drawGuestEntrance(state, state.people.id[guest.slot] as number);
  if (travelTo(guest, phase, from, entrance)) return true;
  return entrance.kind === 'subway' && travelTo(guest, phase, from, streetEntrance(state));
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
  if (walkOut(guest, 'leaving', currentPlace(guest))) return;
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
  if (walkOut(guest, 'toExit', unitPlace(guest.room))) return;
  guest.routine.slots = withSlot(guest.routine.slots, RETURN_SLOT, NO_SLOT);
  settle(guest);
}

/** The way back to the room is required, so with no route it is tried again later. */
function startReturn(guest: Guest): void {
  const entrance = drawGuestEntrance(guest.state, guest.state.people.id[guest.slot] as number);
  if (walkIn(guest, 'toRoom', entrance)) return;
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

/** The VIP only dines, and only when a restaurant has a route (people spec 9). */
function outingTypeOf(guest: Guest): VisitedVenueType | null {
  if (!isVip(guest.state.people, guest.slot)) return outingTypeWithCandidates(guest.state);
  return hasVenueCandidate(guest.state, 'restaurant') ? 'restaurant' : null;
}

function startOuting(guest: Guest): void {
  const type = outingTypeOf(guest);
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

/** A guest in the room is due for their next intention, or else for bed. */
function intentionIsDue(guest: Guest): boolean {
  const next = nextIntention(guest.routine.slots);
  return (
    next !== null && stepOfSlot(dayStartOf(guest.state.step), next.slotValue) === guest.state.step
  );
}

function goToSleep(guest: Guest): void {
  const { state, slot } = guest;
  const wake = drawWakeStep(state, state.step, WAKE_WINDOWS);
  save(state, slot, { ...guest.routine, phase: 'sleeping', venue: 0 }, wake);
}

/** Nothing of the day's plan starts before the guest has been up for a while. */
function wakeUp(guest: Guest): void {
  const { state } = guest;
  const dayStart = dayStartOf(state.step);
  const ready = state.step + drawWakeDelay(state);
  const readyMinute = Math.floor((ready - dayStart) / STEPS_PER_MINUTE) + 1;
  const [leave, back, outing] = guest.routine.slots.map((slotValue) =>
    slotValue !== NO_SLOT && stepOfSlot(dayStart, slotValue) < ready ? readyMinute : slotValue,
  );
  guest.routine.slots = [leave, back, outing] as unknown as GuestSlots;
  settle(guest);
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
  countVenueVisit(state, venue, stressOfTripEndedNow(state, guest.slot), 'hotel-guest');
  const stayEnds = state.step + VENUE_VISIT_MINUTES[type] * STEPS_PER_MINUTE;
  save(state, guest.slot, { ...routine, phase: 'atVenue' }, stayEnds);
}

function advance(guest: Guest): void {
  const { routine, slot, room } = guest;
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
      if (intentionIsDue(guest)) startIntention(guest);
      else goToSleep(guest);
      break;
    case 'sleeping':
      wakeUp(guest);
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
    case 'leaveRetry':
      startDeparture(guest);
      break;
  }
}

function isAtEntrance(state: TowerState, slot: number): boolean {
  const pool = state.people;
  return [entrancePlace(state, false), entrancePlace(state, true)].some(
    (place) => place?.level === pool.level[slot] && place?.column === pool.column[slot],
  );
}

/** The guest reached an entrance on the way out. The VIP's visit is judged before they go. */
function leaveTower(context: StepContext, slot: number): void {
  const { state } = context;
  const personId = state.people.id[slot] as number;
  if (isVip(state.people, slot)) vipLeftTower(context, personId, isAtEntrance(state, slot));
  removePerson(state, personId);
}

function runGuest(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  if (!isHotelGuest(pool, slot)) return;
  const personId = pool.id[slot];
  while (pool.id[slot] === personId && pool.dueStep[slot] === state.step) {
    const routine = decodeGuestRoutine(pool.trip[slot] ?? NO_TRIP);
    const room = roomOf(state, pool.homeUnit[slot] as number);
    if (routine?.phase === 'leaving') {
      leaveTower(context, slot);
      return;
    }
    if (!routine || !room) {
      removePerson(state, personId as number);
      return;
    }
    advance({ context, state, slot, room, routine });
  }
}

function drawDayPlan(state: TowerState, checkOutDay: boolean, vip: boolean): GuestSlots {
  if (checkOutDay) {
    const leave = windowSlot(state, vip ? VIP_LEAVE : HOTEL_CHECK_OUT_LEAVE);
    return [leave, NO_SLOT, NO_SLOT];
  }
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

/**
 * A guest in the room who is awake and waiting for bed time rather than for an intention: the due
 * step is not the time of their next intention.
 */
function bedTimeOf(pool: PersonPool, slot: number, dayStart: number): number | null {
  const routine = guestRoutineAt(pool, slot);
  const due = pool.dueStep[slot] as number;
  if (routine?.phase !== 'room' || due === NOTHING_DUE) return null;
  const next = nextIntention(routine.slots);
  return next && stepOfSlot(dayStart, next.slotValue) === due ? null : due;
}

/**
 * People spec 1.3 and 8.2: at 00:00 each guest whose stay continues today draws a plan. A sleeper
 * keeps sleeping and a guest waiting for bed time keeps that time; the plan starts after waking.
 */
function drawPlans(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isHotelGuest(pool, slot)) continue;
    const room = roomOf(state, pool.homeUnit[slot] as number);
    const stayEnd = room?.hotel.stayEndStep ?? null;
    if (!room || stayEnd === null) continue;
    const sleeping = guestRoutineAt(pool, slot)?.phase === 'sleeping';
    const keptWake = sleeping ? (pool.dueStep[slot] as number) : null;
    const keptBed = sleeping ? null : bedTimeOf(pool, slot, state.step - STEPS_PER_DAY);
    if (!sleeping && keptBed === null && isOnTrek(pool, slot)) cancelTrek(context, slot);
    const checkOutDay = dayStartOf(stayEnd) === dayStartOf(state.step);
    const slots = drawDayPlan(state, checkOutDay, isVip(pool, slot));
    if (keptWake !== null) {
      save(state, slot, { phase: 'sleeping', venue: 0, slots }, keptWake);
      continue;
    }
    settleInRoom(state, slot, room, { phase: 'room', venue: 0, slots }, { bedFirst: true });
    if (keptBed !== null) pool.dueStep[slot] = keptBed;
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
    if (routine.phase === 'room' || routine.phase === 'sleeping') continue;
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
