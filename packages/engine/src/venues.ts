import {
  CINEMA_CHANGE_FILM_FROM_AGE_DAYS,
  CINEMA_SHOW_HOURS,
  CINEMA_SHOW_LENGTH_HOURS,
  DAILY_INCOME_BRACKETS,
  VENUE_HOURS,
  VENUE_PAYOUT_HOURS,
  type IncomeBracket,
  type TowerState,
  type Unit,
  type UnitId,
  type UnitType,
  type VenueDay,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { filmAgeDays } from './films';
import { recordShopVisit } from './leases';
import { chargeMoney, creditMoney } from './money';
import { emitNews } from './news';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { writableUnit } from './step-copy';
import { isVenueType } from './units';

type VenueType = keyof typeof VENUE_PAYOUT_HOURS;
type VenueUnit = Unit & { type: VenueType; venue: VenueDay };

const VENUE_TYPES = Object.keys(VENUE_PAYOUT_HOURS) as VenueType[];

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

/** Steps of the day between which visits count: payout hours, or 10:00 to 20:00 for a shop. */
function countingSteps(type: UnitType): { from: number; to: number } | null {
  if (type === 'retail-shop') {
    const hours = VENUE_HOURS['retail-shop'];
    return { from: hours.open * STEPS_PER_MINUTE, to: hours.close * STEPS_PER_MINUTE };
  }
  if (!isVenueType(type)) return null;
  const hours = VENUE_PAYOUT_HOURS[type];
  return { from: hourStep(hours.opens), to: hourStep(hours.pays) };
}

function countsVisitsNow(unit: Unit, stepOfDay: number): boolean {
  if (unit.type === 'retail-shop' && unit.lease === null) return false;
  const steps = countingSteps(unit.type);
  return steps !== null && stepOfDay >= steps.from && stepOfDay < steps.to;
}

function isBetweenCinemaShows(unit: Unit, stepOfDay: number): boolean {
  return unit.type === 'cinema' && cinemaShowAt(stepOfDay) === null;
}

/** Adds a visit to the payout counts: a cinema counts the show it falls in. */
function addPayoutVisit(unit: VenueUnit, stepOfDay: number): void {
  if (unit.type === 'cinema' && cinemaShowAt(stepOfDay) === 1) unit.venue.eveningShowVisits += 1;
  else unit.venue.visits += 1;
}

/**
 * Counts a visit that starts now in a venue or retail shop. Visits outside the counting hours,
 * entries to a cinema between its shows and visits to a shop without a tenant are not counted.
 * The stress of the trip that brought the person, when it was walked, feeds the next day's
 * outside customers. Returns whether the visit was counted.
 */
export function countVenueVisit(
  state: TowerState,
  counted: Unit,
  tripStress: number | null = null,
): boolean {
  const stepOfDay = state.step % STEPS_PER_DAY;
  if (!counted.venue || !countsVisitsNow(counted, stepOfDay)) return false;
  if (isBetweenCinemaShows(counted, stepOfDay)) return false;
  const unit = writableUnit(state, counted);
  const venue = unit.venue as VenueDay;
  if (isVenue(unit)) addPayoutVisit(unit, stepOfDay);
  unit.used = true;
  venue.countToday += 1;
  recordShopVisit(state, unit);
  if (tripStress !== null) {
    venue.stressSum += tripStress;
    venue.stressTrips += 1;
  }
  return true;
}

/** Counts a visit to the unit with this id; throws if it keeps no visit counts. */
export function recordVenueVisit(
  state: TowerState,
  id: UnitId,
  tripStress: number | null = null,
): boolean {
  const unit = state.units[id];
  if (!unit?.venue) {
    throw new Error(`Unit ${id} is not a food, entertainment or retail venue`);
  }
  return countVenueVisit(state, unit, tripStress);
}

/**
 * Starts a new day at 00:00 (stars spec 3.2): today's count becomes the previous-day count and
 * the stress sums start again. Returns the average trip stress of the day that ended, or null
 * when no walked trip reached the venue.
 */
export function rollVenueDay(venue: VenueDay): number | null {
  const averageStress =
    venue.stressTrips === 0 ? null : Math.floor(venue.stressSum / venue.stressTrips);
  venue.previousDayCount = venue.countToday;
  venue.countToday = 0;
  venue.stressSum = 0;
  venue.stressTrips = 0;
  return averageStress;
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
    Math.floor(step / STEPS_PER_DAY) * STEPS_PER_DAY +
    hourStep(VENUE_PAYOUT_HOURS[unit.type].opens);
  return unit.placedAtStep <= openingStep;
}

const LOSS_NEWS: Partial<Record<VenueType, 'news.fastFoodLoss' | 'news.restaurantLoss'>> = {
  'fast-food': 'news.fastFoodLoss',
  restaurant: 'news.restaurantLoss',
};

/** A cinema with a young film or a party hall that pays nothing says why (messages MSG-09, MSG-10). */
function unpaidVenueNews(
  state: TowerState,
  unit: VenueUnit,
): 'news.cinemaLowAudience' | 'news.partyHallEmpty' | null {
  if (unit.type === 'party-hall') return 'news.partyHallEmpty';
  const filmIsYoung = (filmAgeDays(state, unit) ?? 0) < CINEMA_CHANGE_FILM_FROM_AGE_DAYS;
  return unit.type === 'cinema' && filmIsYoung ? 'news.cinemaLowAudience' : null;
}

function payOut(context: StepContext, unit: VenueUnit): void {
  const { state } = context;
  const customers = customersOf(unit);
  let result: number | null = null;
  if (wasOpenToday(unit, state.step)) {
    result = amountFor(DAILY_INCOME_BRACKETS[unit.type], customers);
    if (result > 0) creditMoney(state, 'venues', result);
    if (result < 0) {
      chargeMoney(state, 'venues', -result);
      const lossNews = LOSS_NEWS[unit.type];
      if (lossNews) context.events.push(...emitNews(state, lossNews, { unitId: unit.id }));
    }
    if (result === 0) {
      const unpaidNews = unpaidVenueNews(state, unit);
      if (unpaidNews) context.events.push(...emitNews(state, unpaidNews, { unitId: unit.id }));
    }
  }
  unit.venue.yesterday = { visits: customers, result };
  unit.venue.visits = 0;
  unit.venue.eveningShowVisits = 0;
}

function payoutHook(type: VenueType): ScheduledHook {
  return {
    name: `venue-payout-${type}`,
    schedule: { every: 'day', hour: VENUE_PAYOUT_HOURS[type].pays, minute: 0 },
    run(context) {
      for (const unit of Object.values(context.state.units)) {
        if (unit.type === type && isVenue(unit)) payOut(context, writableUnit(context.state, unit));
      }
    },
  };
}

/** One daily hook per venue type, each at the type's payout time. */
export const venuePayoutHooks: readonly ScheduledHook[] = VENUE_TYPES.map(payoutHook);
