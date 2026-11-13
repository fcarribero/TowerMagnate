import {
  HOTEL_BOOKING_CHANCE,
  HOTEL_CHECK_IN_HOURS,
  HOTEL_CHECK_OUT_EARLIEST_HOUR,
  HOTEL_CHECK_OUT_HOUR,
  HOTEL_NIGHTLY_PRICE,
  HOTEL_STAY_NIGHT_WEIGHTS,
  type HotelRoomState,
  type RngState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { dateOfStep, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { releaseStayGuests } from './hotel-guest-trip';
import { creditMoney, pushUnitMoney } from './money';
import { priceRatio } from './pricing';
import { nextInt } from './rng';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { unitNumber } from './units';
import { clearUnitLedger, storeGrade } from './unit-evaluation';

type RoomType = keyof typeof HOTEL_NIGHTLY_PRICE;
export type RoomUnit = Unit & { type: RoomType; hotel: NonNullable<Unit['hotel']> };

export type CheckInResult =
  | { checkedIn: true; nights: number }
  | { checkedIn: false; reason: 'outsideCheckInHours' | 'roomNotClean' };

export function isRoom(unit: Unit): unit is RoomUnit {
  return unit.type in HOTEL_NIGHTLY_PRICE && unit.hotel !== null;
}

/** Draws a stay length of 1 to 4 nights with the weights of HOTEL_STAY_NIGHT_WEIGHTS. */
export function drawStayNights(rng: RngState): number {
  let roll = nextInt(rng, 0, 99);
  for (const [index, weight] of HOTEL_STAY_NIGHT_WEIGHTS.entries()) {
    if (roll < weight) return index + 1;
    roll -= weight;
  }
  return HOTEL_STAY_NIGHT_WEIGHTS.length;
}

/** Percent chance of a booking at the room's daily roll (people.md 8.1). */
export function bookingChance(room: Unit): number {
  return HOTEL_BOOKING_CHANCE[room.evaluation ?? 'ungraded'];
}

/** One booking roll for a room by its stored grade; true books it. */
export function rollBooking(rng: RngState, room: Unit): boolean {
  return nextInt(rng, 0, 99) < bookingChance(room);
}

function isCheckInTime(step: number): boolean {
  const { hour, minute } = dateOfStep(step);
  const { from, until } = HOTEL_CHECK_IN_HOURS;
  return hour >= from && (hour < until || (hour === until && minute === 0));
}

/**
 * The minute of the day a stay ends on its last day, drawn from the room and the check-in step
 * alone (no rng draw): between 07:00 and 10:00, both included.
 */
export function checkOutMinuteOf(roomNumber: number, checkInStep: number): number {
  let hash = Math.imul(roomNumber ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(checkInStep, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  const earliest = HOTEL_CHECK_OUT_EARLIEST_HOUR * 60;
  return earliest + (hash % (HOTEL_CHECK_OUT_HOUR * 60 - earliest + 1));
}

/** The step a stay ends: the check-out minute of the last day, `nights` days after check-in. */
export function stayEndStep(
  checkInStep: number,
  nights: number,
  checkOutMinute = HOTEL_CHECK_OUT_HOUR * 60,
): number {
  const checkInDay = Math.floor(checkInStep / STEPS_PER_DAY);
  return (checkInDay + nights) * STEPS_PER_DAY + checkOutMinute * STEPS_PER_MINUTE;
}

export function setRoomState(context: StepContext, room: RoomUnit, state: HotelRoomState): void {
  room.hotel.state = state;
  context.events.push({
    type: 'roomStateChanged',
    step: context.state.step,
    unitId: room.id,
    state,
  });
}

/**
 * Checks a party into a room at the current step. The stay is charged at check-out, at the price
 * set now. Called by the
 * guest routine and by tests. A refused check-in changes nothing. The VIP passes `nights` and
 * draws no stay length (economy E-23).
 */
export function checkIn(context: StepContext, roomId: UnitId, nights?: number): CheckInResult {
  const found = context.state.units[roomId];
  if (!found || !isRoom(found)) {
    throw new Error(`Unit ${roomId} is not a hotel room`);
  }
  const step = context.state.step;
  if (!isCheckInTime(step)) {
    return { checkedIn: false, reason: 'outsideCheckInHours' };
  }
  if (found.hotel.state !== 'clean') {
    return { checkedIn: false, reason: 'roomNotClean' };
  }
  const room = writableUnit(context.state, found);
  const stayNights = nights ?? drawStayNights(context.state.rng);
  room.hotel.stayRate = room.price;
  // The VIP keeps the latest hour; every other stay draws its own check-out time.
  const checkOutMinute =
    nights === undefined ? checkOutMinuteOf(unitNumber(room.id), step) : undefined;
  room.hotel.stayEndStep = stayEndStep(step, stayNights, checkOutMinute);
  room.hotel.checkInStep = step;
  room.hotel.paidRatio = priceRatio(room);
  room.hotel.arrivalStep = null;
  room.hotel.rollDue = false;
  clearUnitLedger(context.state, room.id);
  room.used = true;
  context.events.push({ type: 'hotelCheckIn', step, unitId: room.id, nights: stayNights });
  setRoomState(context, room, 'occupied');
  return { checkedIn: true, nights: stayNights };
}

/** A maid finished cleaning the room: it is clean, counts no dirty checks and may roll for a booking. */
export function finishCleaning(context: StepContext, roomId: UnitId): void {
  const found = context.state.units[roomId];
  if (!found || !isRoom(found) || found.hotel.state !== 'dirty') {
    throw new Error(`Unit ${roomId} is not a dirty hotel room`);
  }
  const room = writableUnit(context.state, found);
  room.hotel.dirtyChecks = 0;
  room.hotel.rollDue = true;
  setRoomState(context, room, 'clean');
}

/** Nights between the check-in day and the check-out day of the stay that ends now. */
function stayNightsOf(room: RoomUnit): number {
  const { checkInStep, stayEndStep } = room.hotel;
  if (checkInStep === null || stayEndStep === null) return 1;
  const days = Math.floor(stayEndStep / STEPS_PER_DAY) - Math.floor(checkInStep / STEPS_PER_DAY);
  return Math.max(1, days);
}

/** The guests leave in the morning and pay for every night they stayed. */
function checkOut(context: StepContext, room: RoomUnit): void {
  storeGrade(context.state, room);
  const nights = stayNightsOf(room);
  // A stay from an older save has no rate: it was paid at check-in.
  const rate = room.hotel.stayRate ?? 0;
  const paid = rate > 0 ? creditMoney(context.state, 'hotel', nights * rate) : 0;
  room.hotel.stayEndStep = null;
  room.hotel.stayRate = null;
  context.events.push({
    type: 'hotelCheckOut',
    step: context.state.step,
    unitId: room.id,
    nights,
    paid,
  });
  if (paid > 0) pushUnitMoney(context, room.id, paid, 'hotel');
  setRoomState(context, room, 'dirty');
  releaseStayGuests(context, unitNumber(room.id));
}

/** Runs every step, so it walks the units without building a list unless a stay ends. */
function stayersEndingAt(step: number, units: Record<UnitId, Unit>): readonly RoomUnit[] {
  let rooms: RoomUnit[] | null = null;
  for (const id in units) {
    const unit = units[id as UnitId] as Unit;
    if (unit.hotel?.stayEndStep !== step || !isRoom(unit)) continue;
    rooms ??= [];
    rooms.push(unit);
  }
  if (rooms === null) return [];
  return rooms.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Ends each stay at its check-out time and leaves the room dirty, in order of unit id. */
export function createHotelSystem(): SimulationSystem {
  return (context) => {
    for (const room of stayersEndingAt(context.state.step, context.state.units)) {
      checkOut(context, writableUnit(context.state, room));
    }
  };
}
