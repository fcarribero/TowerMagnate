import {
  HOTEL_CHECK_IN_HOURS,
  HOTEL_CHECK_OUT_HOUR,
  HOTEL_NIGHTLY_PRICE,
  HOTEL_STAY_NIGHT_WEIGHTS,
  type HotelRoomState,
  type RngState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { dateOfStep, STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { creditMoney } from './money';
import { nextInt } from './rng';
import type { SimulationSystem, StepContext } from './step';
import { unitNumber } from './units';
import { clearUnitLedger, storeGrade } from './unit-evaluation';

type RoomType = keyof typeof HOTEL_NIGHTLY_PRICE;
type RoomUnit = Unit & { type: RoomType; hotel: NonNullable<Unit['hotel']> };

export type CheckInResult =
  | { checkedIn: true; nights: number; paid: number }
  | { checkedIn: false; reason: 'outsideCheckInHours' | 'roomNotClean' };

function isRoom(unit: Unit): unit is RoomUnit {
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

function isCheckInTime(step: number): boolean {
  const { hour, minute } = dateOfStep(step);
  const { from, until } = HOTEL_CHECK_IN_HOURS;
  return hour >= from && (hour < until || (hour === until && minute === 0));
}

function stayEndStep(checkInStep: number, nights: number): number {
  const checkInDay = Math.floor(checkInStep / STEPS_PER_DAY);
  return (checkInDay + nights) * STEPS_PER_DAY + HOTEL_CHECK_OUT_HOUR * STEPS_PER_HOUR;
}

function setRoomState(context: StepContext, room: RoomUnit, state: HotelRoomState): void {
  room.hotel.state = state;
  context.events.push({
    type: 'roomStateChanged',
    step: context.state.step,
    unitId: room.id,
    state,
  });
}

/**
 * Checks a party into a room at the current step and credits the whole stay at once. Called by the
 * guest routine and by tests. A refused check-in changes nothing.
 */
export function checkIn(context: StepContext, roomId: UnitId): CheckInResult {
  const room = context.state.units[roomId];
  if (!room || !isRoom(room)) {
    throw new Error(`Unit ${roomId} is not a hotel room`);
  }
  const step = context.state.step;
  if (!isCheckInTime(step)) {
    return { checkedIn: false, reason: 'outsideCheckInHours' };
  }
  if (room.hotel.state !== 'clean') {
    return { checkedIn: false, reason: 'roomNotClean' };
  }
  const nights = drawStayNights(context.state.rng);
  const paid = creditMoney(
    context.state,
    'hotel',
    nights * HOTEL_NIGHTLY_PRICE[room.type][room.priceLevel],
  );
  room.hotel.stayEndStep = stayEndStep(step, nights);
  room.hotel.checkInStep = step;
  room.hotel.paidLevel = room.priceLevel;
  clearUnitLedger(context.state, room.id);
  room.used = true;
  context.events.push({ type: 'hotelCheckIn', step, unitId: room.id, nights, paid });
  setRoomState(context, room, 'occupied');
  return { checkedIn: true, nights, paid };
}

function checkOut(context: StepContext, room: RoomUnit): void {
  storeGrade(context.state, room);
  room.hotel.stayEndStep = null;
  context.events.push({ type: 'hotelCheckOut', step: context.state.step, unitId: room.id });
  setRoomState(context, room, 'dirty');
}

function stayersEndingAt(step: number, units: Record<UnitId, Unit>): RoomUnit[] {
  return Object.values(units)
    .filter((unit): unit is RoomUnit => isRoom(unit) && unit.hotel.stayEndStep === step)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Ends each stay at its check-out time and leaves the room dirty, in order of unit id. */
export function createHotelSystem(): SimulationSystem {
  return (context) => {
    for (const room of stayersEndingAt(context.state.step, context.state.units)) {
      checkOut(context, room);
    }
  };
}
