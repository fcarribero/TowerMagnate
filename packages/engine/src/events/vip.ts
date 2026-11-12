import {
  HOTEL_BOOKING_ROLL_MINUTE,
  VIP_ARRIVAL,
  VIP_BASE_PERCENT,
  VIP_GUARANTEE_DAY,
  VIP_MAX_STRESS_STEPS,
  VIP_STARS,
  VIP_STEP_PERCENT,
  type TowerState,
  type Unit,
  type UnitId,
  type VipVisit,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { emitNews } from '../news';
import { slotOfPerson } from '../people';
import { nextInt } from '../rng';
import type { ScheduledHook } from '../scheduler';
import type { StepContext } from '../step';
import { drawMinuteFromWindow } from '../time-windows';
import { tripsOf } from '../trip-ledger';
import { writableUnit } from '../step-copy';
import { unitNumber } from '../units';

function dayOf(step: number): number {
  return Math.floor(step / STEPS_PER_DAY);
}

function newVisitId(state: TowerState): string {
  const id = `e${state.nextId}`;
  state.nextId += 1;
  return id;
}

/**
 * Starts a VIP visit whose suite is booked at 12:00 on `day`. Returns null while another visit is
 * in progress. The daily roll and the debug hook both open visits through here.
 */
export function openVipVisit(state: TowerState, day: number): VipVisit | null {
  if (state.vipVisit !== null) return null;
  const visit: VipVisit = {
    id: newVisitId(state),
    day,
    startedAtStars: state.stars,
    unitId: null,
    personId: null,
    outcome: 'pending',
  };
  state.vipVisit = visit;
  return visit;
}

/** A visit forced now books today if 12:00 is still ahead, otherwise tomorrow. */
export function openVipVisitNow(state: TowerState): VipVisit | null {
  const minute = Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
  const today = dayOf(state.step);
  return openVipVisit(state, minute < HOTEL_BOOKING_ROLL_MINUTE ? today : today + 1);
}

/** Events spec 6.1: the chance in percent of the next roll, 100 on the guarantee day. */
export function vipRollPercent(dryDays: number): number {
  if (dryDays + 1 >= VIP_GUARANTEE_DAY) return 100;
  return VIP_BASE_PERCENT + VIP_STEP_PERCENT * dryDays;
}

/**
 * Events spec 6.1: at 00:00, at exactly 3 stars with no visit in progress, roll with a chance that
 * rises with each roll since the last VIP day.
 */
export function rollVipVisit(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_DAY !== 0) return;
  if (state.stars !== VIP_STARS || state.vipVisit !== null) return;
  if (nextInt(state.rng, 0, 99) >= vipRollPercent(state.vipDryDays)) {
    state.vipDryDays += 1;
    return;
  }
  state.vipDryDays = 0;
  openVipVisit(state, dayOf(state.step));
}

function isFreeCleanSuite(unit: Unit): boolean {
  const hotel = unit.hotel;
  return (
    unit.type === 'suite' &&
    hotel !== null &&
    hotel.state === 'clean' &&
    hotel.stayEndStep === null &&
    hotel.arrivalStep === null
  );
}

function lowestFreeSuite(state: TowerState): Unit | null {
  let best: Unit | null = null;
  for (const id in state.units) {
    const unit = state.units[id as UnitId] as Unit;
    if (!isFreeCleanSuite(unit)) continue;
    if (best === null || unitNumber(unit.id) < unitNumber(best.id)) best = unit;
  }
  return best;
}

/** People spec 9: at 12:00 on the VIP day, before the hotel rolls, the VIP books a suite. */
function bookSuite(context: StepContext): void {
  const { state } = context;
  const visit = state.vipVisit;
  if (!visit || visit.unitId !== null || visit.day !== dayOf(state.step)) return;
  const free = lowestFreeSuite(state);
  if (!free?.hotel) {
    state.vipVisit = null;
    context.events.push(...emitNews(state, 'news.vipNoSuite', { eventId: visit.id }));
    return;
  }
  const suite = writableUnit(state, free);
  if (!suite.hotel) return;
  visit.unitId = suite.id;
  suite.hotel.rollDue = false;
  const dayStart = visit.day * STEPS_PER_DAY;
  suite.hotel.arrivalStep =
    dayStart + drawMinuteFromWindow(state.rng, VIP_ARRIVAL) * STEPS_PER_MINUTE;
  context.events.push(
    ...emitNews(state, 'news.vipArrives', { eventId: visit.id, unitId: suite.id }),
  );
}

export const vipBookingHook: ScheduledHook = {
  name: 'vip-booking',
  schedule: {
    every: 'day',
    hour: Math.floor(HOTEL_BOOKING_ROLL_MINUTE / 60),
    minute: HOTEL_BOOKING_ROLL_MINUTE % 60,
  },
  run: bookSuite,
};

/** The VIP of the visit in progress who has not appeared yet and is due in this suite. */
export function isVipBooking(state: TowerState, roomId: UnitId): boolean {
  const visit = state.vipVisit;
  return visit?.outcome === 'pending' && visit.unitId === roomId && visit.personId === null;
}

/** People spec 9: the average stress of all the VIP's trips, including the trip out. */
export function vipTripStress(state: TowerState, personId: number): number {
  const trips = tripsOf(state, personId);
  if (trips.length === 0) return 0;
  const sum = trips.reduce((total, trip) => total + trip.stress, 0);
  return sum / trips.length;
}

/**
 * Events spec 6.3: judges the visit once. An approval that started at 3 stars sets the flag; a
 * rejection never clears it.
 */
export function endVipVisit(context: StepContext, approved: boolean): void {
  const { state } = context;
  const visit = state.vipVisit;
  if (!visit || visit.outcome !== 'pending') return;
  visit.outcome = approved ? 'approved' : 'rejected';
  if (approved && visit.startedAtStars === VIP_STARS) state.vipApproved = true;
  const key = approved ? 'news.vipApproved' : 'news.vipRejected';
  context.events.push(...emitNews(state, key, { eventId: visit.id, unitId: visit.unitId }));
}

/**
 * The VIP's last trip ended and they leave the tower. Only a VIP who left through an entrance with
 * low stress approves the visit.
 */
export function vipLeftTower(context: StepContext, personId: number, atEntrance: boolean): void {
  const visit = context.state.vipVisit;
  if (visit?.personId !== personId) return;
  const calm = vipTripStress(context.state, personId) < VIP_MAX_STRESS_STEPS;
  endVipVisit(context, atEntrance && calm);
}

function isStillBooked(state: TowerState, unitId: UnitId): boolean {
  const room = state.units[unitId];
  return room?.hotel?.arrivalStep != null || room?.hotel?.stayEndStep != null;
}

/** The VIP is gone without leaving through an entrance, or will never come. */
function isVisitLost(state: TowerState, visit: VipVisit): boolean {
  if (visit.unitId === null) return false;
  if (visit.personId === null) return !isStillBooked(state, visit.unitId);
  return slotOfPerson(state.people, visit.personId) < 0;
}

function stayGoesOn(state: TowerState, visit: VipVisit): boolean {
  if (visit.unitId === null || visit.personId === null) return false;
  return state.units[visit.unitId]?.hotel?.stayEndStep != null;
}

/**
 * Events phase: rejects a visit whose VIP was removed or gave up, and forgets a judged visit once
 * the VIP's stay is over. A visit that missed its 12:00 booking is dropped the next day.
 */
export function runVipVisit(context: StepContext): void {
  const { state } = context;
  const visit = state.vipVisit;
  if (!visit) return;
  if (visit.unitId === null) {
    if (dayOf(state.step) > visit.day) state.vipVisit = null;
    return;
  }
  if (visit.outcome === 'pending' && isVisitLost(state, visit)) endVipVisit(context, false);
  if (visit.outcome !== 'pending' && !stayGoesOn(state, visit)) state.vipVisit = null;
}

/** Stars spec S-01: the VIP's stay counts 1 person instead of the suite's party of 2. */
export function isVipStay(state: TowerState, unitId: UnitId): boolean {
  const visit = state.vipVisit;
  return visit !== null && visit.unitId === unitId && visit.personId !== null;
}
