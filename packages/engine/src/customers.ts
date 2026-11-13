import {
  CUSTOMER_ARRIVAL,
  CUSTOMER_STAY_MINUTES,
  OUTSIDE_CUSTOMER_BASE,
  RETAIL_PRICE_CUSTOMER_FACTOR,
  SUBWAY_VISITOR_FACTOR,
  VENUE_CAPACITY,
  VENUE_HOURS,
  closingMinute,
  type PriceLevel,
  type TowerState,
  type Unit,
  type VenueDay,
  type VisitedVenueType,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { unitPlace } from './office-routine';
import { drawEntrance, entranceDoor, streetEntrance, subwayStation } from './outside-entrances';
import { addPerson, createPeopleSystem, NOTHING_DUE, removePerson, slotOfPerson } from './people';
import { venueStressFactor } from './person-stress';
import { visitorsAt } from './resident-routine';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { writableUnit } from './step-copy';
import { drawMinuteFromWindow } from './time-windows';
import { startTrek } from './trek';
import {
  drawShowArrivals,
  isShowVenue,
  showCapacity,
  showEntryAt,
  showGuestCount,
  showVisitorKind,
  type ShowVenue,
} from './show-visitors';
import { stressOfLastTrip, stressOfTripEndedNow } from './trip-ledger';
import { fileShopVisit } from './unit-evaluation';
import { unitNumber } from './units';
import {
  changeCustomersInside,
  customersInsideVenue,
  customerTripAt,
  encodeCustomerTrip,
  forgetCustomersInside,
  isOutsideVisitor,
  type CustomerEntrance,
  type CustomerPhase,
} from './venue-visitors';
import { countVenueVisit, rollVenueDay } from './venues';
import { isVenueStaffed } from './venue-staff';

const CUSTOMER_VENUE_TYPES: readonly string[] = Object.keys(CUSTOMER_ARRIVAL);

type CustomerVenue = Unit & { type: VisitedVenueType; venue: VenueDay };

function isCustomerVenueType(type: string): type is VisitedVenueType {
  return CUSTOMER_VENUE_TYPES.includes(type);
}

export interface OutsideCustomerFactors {
  type: VisitedVenueType;
  priceLevel: PriceLevel;
  weekend: boolean;
  /** Average trip stress of yesterday's visits in steps, or null when nobody walked there. */
  averageStress: number | null;
  subway: boolean;
}

function percent(factor: number): number {
  return Math.round(factor * 100);
}

/**
 * Outside customers for one day, N = floor(base x price x stress x subway) (people spec 11.3).
 * The factors are multiplied as whole percents so the floor never lands one short.
 */
export function outsideCustomerCount(factors: OutsideCustomerFactors): number {
  const base = OUTSIDE_CUSTOMER_BASE[factors.type][factors.weekend ? 'weekend' : 'weekday'];
  const price =
    factors.type === 'retail-shop' ? RETAIL_PRICE_CUSTOMER_FACTOR[factors.priceLevel] : 1;
  const stress = factors.averageStress === null ? 1 : venueStressFactor(factors.averageStress);
  const subway = factors.subway ? SUBWAY_VISITOR_FACTOR : 1;
  const product = base * percent(price) * percent(stress) * percent(subway);
  return Math.floor(product / 1_000_000);
}

function hasSubwayStation(state: TowerState): boolean {
  return subwayStation(state) !== null;
}

function venuesById(state: TowerState): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.venue !== null)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

function getsCustomers(unit: Unit): unit is CustomerVenue {
  if (!unit.venue || !isCustomerVenueType(unit.type)) return false;
  return unit.type !== 'retail-shop' || unit.lease !== null;
}

/** Appearance steps for `count` customers, drawn from the venue's window, earliest first. */
function drawAppearanceSteps(
  state: TowerState,
  type: VisitedVenueType,
  count: number,
  dayStart: number,
): number[] {
  const minutes: number[] = [];
  for (let index = 0; index < count; index++) {
    minutes.push(drawMinuteFromWindow(state.rng, CUSTOMER_ARRIVAL[type]));
  }
  minutes.sort((a, b) => a - b);
  return minutes.map((minute) => dayStart + minute * STEPS_PER_MINUTE);
}

/** Every show of the day gets the same number of visitors, from the venue's cap and yesterday's stress. */
function planShowVisitors(
  state: TowerState,
  unit: ShowVenue,
  averageStress: number | null,
  subway: boolean,
  dayStart: number,
): number[] {
  const cap = showCapacity(state, unit);
  const guestsPerShow = showGuestCount({ cap, averageStress, subway });
  return drawShowArrivals(state, unit, guestsPerShow, dayStart);
}

/**
 * At 00:00 every venue's day count rolls over (stars spec 3.2), then each food venue and each
 * let shop gets the day's outside customers from yesterday's stress, in increasing unit id.
 */
function planCustomers(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const weekend = isWeekendDay(occurrence.weekday);
  const subway = hasSubwayStation(state);
  for (const shared of venuesById(state)) {
    const unit = writableUnit(state, shared);
    const venue = unit.venue as VenueDay;
    const averageStress = rollVenueDay(venue);
    venue.customers = [];
    if (isShowVenue(unit)) {
      venue.customers = planShowVisitors(state, unit, averageStress, subway, occurrence.step);
      continue;
    }
    if (!getsCustomers(unit)) continue;
    const count = outsideCustomerCount({
      type: unit.type,
      priceLevel: unit.priceLevel,
      weekend,
      averageStress,
      subway,
    });
    venue.customers = drawAppearanceSteps(state, unit.type, count, occurrence.step);
  }
}

function setPhase(
  state: TowerState,
  slot: number,
  phase: CustomerPhase,
  entrance: CustomerEntrance,
): void {
  state.people.trip[slot] = encodeCustomerTrip({ phase, entrance });
}

/** Puts the customer at the entrance's door and starts the walk to the venue, if it has a route. */
function enterBy(
  context: StepContext,
  slot: number,
  unit: Unit,
  entrance: CustomerEntrance,
): boolean {
  const { state } = context;
  const door = entranceDoor(state, entrance);
  if (!door) return false;
  state.people.level[slot] = door.level;
  state.people.column[slot] = door.column;
  setPhase(state, slot, 'toVenue', entrance);
  return startTrek(context, slot, unitPlace(unit));
}

/**
 * A customer appears at an entrance and walks to the venue. A subway customer with no route
 * switches to the street at once; with no route from the street either, they never come.
 */
function sendCustomer(context: StepContext, unit: Unit, station: Unit | null): void {
  const { state } = context;
  const entrance = drawEntrance(state, station);
  const door = entranceDoor(state, entrance);
  if (!door) return;
  const personId = addPerson(state, {
    kind: isShowVenue(unit) ? showVisitorKind(unit.type) : 'customer',
    homeUnit: unitNumber(unit.id),
    level: door.level,
    column: door.column,
  });
  const slot = slotOfPerson(state.people, personId);
  if (enterBy(context, slot, unit, entrance)) return;
  if (entrance.kind === 'subway' && enterBy(context, slot, unit, streetEntrance(state))) return;
  removePerson(state, personId);
}

function sendDueCustomers(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const due = Object.values(state.units)
    .filter((unit) => (unit.venue?.customers[0] ?? Infinity) <= state.step)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  if (due.length === 0) return;
  const station = subwayStation(state);
  for (const shared of due) {
    const unit = writableUnit(state, shared);
    const customers = (unit.venue as VenueDay).customers;
    while ((customers[0] ?? Infinity) <= state.step) {
      customers.shift();
      sendCustomer(context, unit, station);
    }
  }
}

function minuteOfDay(state: TowerState): number {
  return Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function closingMinuteOf(state: TowerState, unit: CustomerVenue): number {
  const day = Math.floor(state.step / STEPS_PER_DAY);
  return closingMinute(unit.type, VENUE_HOURS[unit.type].close, unit.id, day);
}

function isOpen(state: TowerState, unit: CustomerVenue, minute: number): boolean {
  if (!isVenueStaffed(state, unit)) return false;
  const hours = VENUE_HOURS[unit.type];
  const hasTenant = unit.type !== 'retail-shop' || unit.lease !== null;
  return hasTenant && minute >= hours.open && minute < closingMinuteOf(state, unit);
}

function closingStep(state: TowerState, unit: CustomerVenue): number {
  const dayStart = state.step - (state.step % STEPS_PER_DAY);
  return dayStart + closingMinuteOf(state, unit) * STEPS_PER_MINUTE;
}

function customerVenueOf(state: TowerState, slot: number): CustomerVenue | null {
  const unitId = `u${state.people.homeUnit[slot]}`;
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  return unit && unit.venue && isCustomerVenueType(unit.type) ? (unit as CustomerVenue) : null;
}

function exitBy(context: StepContext, slot: number, entrance: CustomerEntrance): boolean {
  const { state } = context;
  setPhase(state, slot, 'leaving', entrance);
  const door = entranceDoor(state, entrance);
  return door !== null && startTrek(context, slot, door);
}

/**
 * Walks the customer out by the entrance they came in by. With no route to the subway they switch
 * to the street at once; with no way out at all they leave at once.
 */
function leaveTower(context: StepContext, slot: number, entrance: CustomerEntrance): void {
  const { state } = context;
  const personId = state.people.id[slot] as number;
  state.people.dueStep[slot] = NOTHING_DUE;
  if (exitBy(context, slot, entrance)) return;
  if (entrance.kind === 'subway' && exitBy(context, slot, streetEntrance(state))) return;
  removePerson(state, personId);
}

function showVenueOf(state: TowerState, slot: number): ShowVenue | null {
  const unitId = `u${state.people.homeUnit[slot]}`;
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  return unit && isShowVenue(unit) ? unit : null;
}

/**
 * A visitor of a show waits inside until it starts and goes in until the entry time is over,
 * when the show has room. The visit counts from the step they go in and lasts until the show ends.
 */
function arriveAtShow(
  context: StepContext,
  slot: number,
  unit: ShowVenue,
  entrance: CustomerEntrance,
): void {
  const { state } = context;
  const stepOfDay = state.step % STEPS_PER_DAY;
  const dayStart = state.step - stepOfDay;
  const entry = showEntryAt(unit.type, stepOfDay);
  if (entry.kind === 'wait') {
    state.people.dueStep[slot] = dayStart + entry.until;
    return;
  }
  const venue = unitNumber(unit.id);
  const full = customersInsideVenue(state, venue) >= showCapacity(state, unit);
  if (entry.kind === 'turnAway' || full || !isVenueStaffed(state, unit)) {
    leaveTower(context, slot, entrance);
    return;
  }
  countVenueVisit(state, unit, stressOfLastTrip(state, slot));
  changeCustomersInside(state, venue, 1);
  setPhase(state, slot, 'atVenue', entrance);
  state.people.dueStep[slot] = dayStart + entry.endsAt;
}

/** In if the venue is open and not full; the visit counts and lasts until its time or closing. */
function arriveAtVenue(context: StepContext, slot: number, entrance: CustomerEntrance): void {
  const { state } = context;
  const show = showVenueOf(state, slot);
  if (show) {
    arriveAtShow(context, slot, show, entrance);
    return;
  }
  const unit = customerVenueOf(state, slot);
  if (unit) fileShopVisit(state, unit, state.people.id[slot] as number);
  const canEnter =
    unit !== null &&
    isOpen(state, unit, minuteOfDay(state)) &&
    visitorsAt(state, unit.type, unitNumber(unit.id)) < VENUE_CAPACITY[unit.type];
  if (!unit || !canEnter) {
    leaveTower(context, slot, entrance);
    return;
  }
  countVenueVisit(state, unit, stressOfTripEndedNow(state, slot));
  changeCustomersInside(state, unitNumber(unit.id), 1);
  setPhase(state, slot, 'atVenue', entrance);
  const stayEnds = state.step + CUSTOMER_STAY_MINUTES[unit.type] * STEPS_PER_MINUTE;
  state.people.dueStep[slot] = Math.min(stayEnds, closingStep(state, unit));
}

function advanceCustomer(context: StepContext, slot: number): void {
  const { state } = context;
  const trip = customerTripAt(state.people, slot);
  if (!trip) return;
  switch (trip.phase) {
    case 'toVenue':
      arriveAtVenue(context, slot, trip.entrance);
      break;
    case 'atVenue':
      changeCustomersInside(state, state.people.homeUnit[slot] as number, -1);
      leaveTower(context, slot, trip.entrance);
      break;
    case 'leaving':
      removePerson(state, state.people.id[slot] as number);
      break;
  }
}

/** People spec 4.1: at 03:00 every customer, audience member and party guest still in the tower leaves the simulation. */
function sendCustomersHome(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  const leaving: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isOutsideVisitor(pool, slot)) leaving.push(pool.id[slot] as number);
  }
  for (const personId of leaving) removePerson(state, personId);
  forgetCustomersInside(state);
}

export interface CustomerSystems {
  planHook: ScheduledHook;
  nightHook: ScheduledHook;
  /** Sends customers in at their appearance step and walks them through the visit. */
  system: SimulationSystem;
}

/** Outside customers of fast food, restaurants and retail shops (people spec 11), and the audience and guests of cinemas and party halls (12, 13). */
export function createCustomers(): CustomerSystems {
  const walk = createPeopleSystem(advanceCustomer);
  return {
    planHook: {
      name: 'venue-customers',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: planCustomers,
    },
    nightHook: {
      name: 'customer-night-leave',
      schedule: { every: 'day', hour: 3, minute: 0 },
      run: sendCustomersHome,
    },
    system: (context) => {
      sendDueCustomers(context);
      walk(context);
    },
  };
}
