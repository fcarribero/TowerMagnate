import {
  CINEMA_SHOW_HOURS,
  CINEMA_SHOW_LENGTH_HOURS,
  DAILY_INCOME_BRACKETS,
  VENUE_HOURS,
  type IncomeBracket,
  type Unit,
  type UnitId,
  type VenueDay,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { chargeMoney, creditMoney } from './money';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { isVenueType } from './units';

type VenueType = keyof typeof VENUE_HOURS;
type VenueUnit = Unit & { type: VenueType; venue: VenueDay };

const VENUE_TYPES = Object.keys(VENUE_HOURS) as VenueType[];

function isVenue(unit: Unit): unit is VenueUnit {
  return isVenueType(unit.type) && unit.venue !== null;
}

function hourStep(hour: number): number {
  return hour * STEPS_PER_HOUR;
}

function cinemaShowAt(stepOfDay: number): 0 | 1 | null {
  for (const [show, hour] of CINEMA_SHOW_HOURS.entries()) {
    const start = hourStep(hour);
    if (stepOfDay >= start && stepOfDay < start + hourStep(CINEMA_SHOW_LENGTH_HOURS)) {
      return show as 0 | 1;
    }
  }
  return null;
}

/**
 * Counts a visit that starts now. Called by the customer routines and by tests. Visits outside
 * the venue's hours, and entries to a cinema between its shows, are not counted. Returns whether
 * the visit was counted.
 */
export function recordVenueVisit(state: { units: Record<UnitId, Unit>; step: number }, id: UnitId) {
  const unit = state.units[id];
  if (!unit || !isVenue(unit)) {
    throw new Error(`Unit ${id} is not a food or entertainment venue`);
  }
  const stepOfDay = state.step % STEPS_PER_DAY;
  const hours = VENUE_HOURS[unit.type];
  if (stepOfDay < hourStep(hours.opens) || stepOfDay >= hourStep(hours.pays)) {
    return false;
  }
  if (unit.type !== 'cinema') {
    unit.venue.visits += 1;
    return true;
  }
  const show = cinemaShowAt(stepOfDay);
  if (show === null) {
    return false;
  }
  if (show === 0) unit.venue.visits += 1;
  else unit.venue.eveningShowVisits += 1;
  return true;
}

function amountFor(brackets: readonly IncomeBracket[], customers: number): number {
  let amount = 0;
  for (const bracket of brackets) {
    if (customers >= bracket.minCustomers) {
      amount = bracket.amount;
    }
  }
  return amount;
}

function customersOf(unit: VenueUnit): number {
  const { visits, eveningShowVisits } = unit.venue;
  return unit.type === 'cinema' ? Math.floor((visits + eveningShowVisits) / 2) : visits;
}

function wasOpenToday(unit: VenueUnit, step: number): boolean {
  const openingStep =
    Math.floor(step / STEPS_PER_DAY) * STEPS_PER_DAY + hourStep(VENUE_HOURS[unit.type].opens);
  return unit.placedAtStep <= openingStep;
}

function payOut(context: StepContext, unit: VenueUnit): void {
  const { state } = context;
  const customers = customersOf(unit);
  let result: number | null = null;
  if (wasOpenToday(unit, state.step)) {
    result = amountFor(DAILY_INCOME_BRACKETS[unit.type], customers);
    if (result > 0) creditMoney(state, 'venues', result);
    if (result < 0) chargeMoney(state, 'venues', -result);
  }
  unit.venue.yesterday = { visits: customers, result };
  unit.venue.visits = 0;
  unit.venue.eveningShowVisits = 0;
}

function payoutHook(type: VenueType): ScheduledHook {
  return {
    name: `venue-payout-${type}`,
    schedule: { every: 'day', hour: VENUE_HOURS[type].pays, minute: 0 },
    run(context) {
      for (const unit of Object.values(context.state.units)) {
        if (unit.type === type && isVenue(unit)) payOut(context, unit);
      }
    },
  };
}

/** One daily hook per venue type, each at the type's payout time. */
export const venuePayoutHooks: readonly ScheduledHook[] = VENUE_TYPES.map(payoutHook);
