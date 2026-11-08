import {
  CUSTOMER_ARRIVAL,
  CUSTOMER_STAY_MINUTES,
  OUTSIDE_CUSTOMER_BASE,
  RETAIL_PRICE_CUSTOMER_FACTOR,
  SUBWAY_VISITOR_FACTOR,
  VENUE_CAPACITY,
  VENUE_HOURS,
  type PriceLevel,
  type TowerState,
  type Unit,
  type VenueDay,
  type VisitedVenueType,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace, unitPlace } from './office-routine';
import { addPerson, createPeopleSystem, NOTHING_DUE, removePerson, slotOfPerson } from './people';
import { venueStressFactor } from './person-stress';
import { visitorsAt } from './resident-routine';
import { chance } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { drawMinuteFromWindow } from './time-windows';
import { startTrek } from './trek';
import { stressOfTripEndedNow } from './trip-ledger';
import { fileShopVisit } from './unit-evaluation';
import { unitNumber } from './units';
import {
  CUSTOMER_KIND,
  changeCustomersInside,
  customerTripAt,
  encodeCustomerTrip,
  forgetCustomersInside,
  type CustomerPhase,
} from './venue-visitors';
import { countVenueVisit, rollVenueDay } from './venues';

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
  return Object.values(state.units).some((unit) => unit.type === 'subway-station');
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

/**
 * At 00:00 every venue's day count rolls over (stars spec 3.2), then each food venue and each
 * let shop gets the day's outside customers from yesterday's stress, in increasing unit id.
 */
function planCustomers(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const weekend = isWeekendDay(occurrence.weekday);
  const subway = hasSubwayStation(state);
  for (const unit of venuesById(state)) {
    const venue = unit.venue as VenueDay;
    const averageStress = rollVenueDay(venue);
    venue.customers = [];
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

function setPhase(state: TowerState, slot: number, phase: CustomerPhase, onRight: boolean): void {
  state.people.trip[slot] = encodeCustomerTrip({ phase, onRight });
}

/** A customer appears at a street entrance and walks to the venue; with no route they never come. */
function sendCustomer(context: StepContext, unit: Unit): void {
  const { state } = context;
  const onRight = chance(state.rng, 0.5);
  const entrance = entrancePlace(state, onRight);
  if (!entrance) return;
  const personId = addPerson(state, {
    kind: 'customer',
    homeUnit: unitNumber(unit.id),
    level: entrance.level,
    column: entrance.column,
  });
  const slot = slotOfPerson(state.people, personId);
  setPhase(state, slot, 'toVenue', onRight);
  if (!startTrek(context, slot, unitPlace(unit))) removePerson(state, personId);
}

function sendDueCustomers(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const due = Object.values(state.units)
    .filter((unit) => (unit.venue?.customers[0] ?? Infinity) <= state.step)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of due) {
    const customers = (unit.venue as VenueDay).customers;
    while ((customers[0] ?? Infinity) <= state.step) {
      customers.shift();
      sendCustomer(context, unit);
    }
  }
}

function minuteOfDay(state: TowerState): number {
  return Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function isOpen(unit: CustomerVenue, minute: number): boolean {
  const hours = VENUE_HOURS[unit.type];
  const hasTenant = unit.type !== 'retail-shop' || unit.lease !== null;
  return hasTenant && minute >= hours.open && minute < hours.close;
}

function closingStep(state: TowerState, unit: CustomerVenue): number {
  const dayStart = state.step - (state.step % STEPS_PER_DAY);
  return dayStart + VENUE_HOURS[unit.type].close * STEPS_PER_MINUTE;
}

function customerVenueOf(state: TowerState, slot: number): CustomerVenue | null {
  const unitId = `u${state.people.homeUnit[slot]}`;
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  return unit && unit.venue && isCustomerVenueType(unit.type) ? (unit as CustomerVenue) : null;
}

/** Walks the customer out by the entrance they came in by; with no way out they leave at once. */
function leaveTower(context: StepContext, slot: number, onRight: boolean): void {
  const { state } = context;
  const personId = state.people.id[slot] as number;
  const exit = entrancePlace(state, onRight);
  setPhase(state, slot, 'leaving', onRight);
  state.people.dueStep[slot] = NOTHING_DUE;
  if (!exit || !startTrek(context, slot, exit)) removePerson(state, personId);
}

/** In if the venue is open and not full; the visit counts and lasts until its time or closing. */
function arriveAtVenue(context: StepContext, slot: number, onRight: boolean): void {
  const { state } = context;
  const unit = customerVenueOf(state, slot);
  if (unit) fileShopVisit(state, unit, state.people.id[slot] as number);
  const canEnter =
    unit !== null &&
    isOpen(unit, minuteOfDay(state)) &&
    visitorsAt(state, unit.type, unitNumber(unit.id)) < VENUE_CAPACITY[unit.type];
  if (!unit || !canEnter) {
    leaveTower(context, slot, onRight);
    return;
  }
  countVenueVisit(state, unit, stressOfTripEndedNow(state, slot));
  changeCustomersInside(state, unitNumber(unit.id), 1);
  setPhase(state, slot, 'atVenue', onRight);
  const stayEnds = state.step + CUSTOMER_STAY_MINUTES[unit.type] * STEPS_PER_MINUTE;
  state.people.dueStep[slot] = Math.min(stayEnds, closingStep(state, unit));
}

function advanceCustomer(context: StepContext, slot: number): void {
  const { state } = context;
  const trip = customerTripAt(state.people, slot);
  if (!trip) return;
  switch (trip.phase) {
    case 'toVenue':
      arriveAtVenue(context, slot, trip.onRight);
      break;
    case 'atVenue':
      changeCustomersInside(state, state.people.homeUnit[slot] as number, -1);
      leaveTower(context, slot, trip.onRight);
      break;
    case 'leaving':
      removePerson(state, state.people.id[slot] as number);
      break;
  }
}

/** People spec 4.1: at 03:00 every customer still in the tower leaves the simulation. */
function sendCustomersHome(context: StepContext): void {
  const { state } = context;
  const pool = state.people;
  const leaving: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] === CUSTOMER_KIND) leaving.push(pool.id[slot] as number);
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

/** Outside customers of fast food, restaurants and retail shops (people spec 11). */
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
