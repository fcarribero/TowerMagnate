import { PERSON_KINDS, type PersonPool, type TowerState } from '@tower-magnate/shared';
import { NO_TRIP } from './people';

export const CUSTOMER_KIND = PERSON_KINDS.indexOf('customer');

export type CustomerPhase = 'toVenue' | 'atVenue' | 'leaving';

const CUSTOMER_PHASES: readonly CustomerPhase[] = ['toVenue', 'atVenue', 'leaving'];

/** What an outside customer is doing, kept in the person's `trip` number. */
export interface CustomerTrip {
  phase: CustomerPhase;
  /** The street entrance the customer came in by, and leaves by. */
  onRight: boolean;
}

export function encodeCustomerTrip(trip: CustomerTrip): number {
  const side = trip.onRight ? 1 : 0;
  return side * CUSTOMER_PHASES.length + CUSTOMER_PHASES.indexOf(trip.phase) + 1;
}

export function customerTripAt(pool: PersonPool, slot: number): CustomerTrip | null {
  if (pool.kind[slot] !== CUSTOMER_KIND) return null;
  const packed = pool.trip[slot] ?? NO_TRIP;
  if (packed === NO_TRIP) return null;
  const phase = CUSTOMER_PHASES[(packed - 1) % CUSTOMER_PHASES.length];
  if (!phase) return null;
  return { phase, onRight: packed > CUSTOMER_PHASES.length };
}

interface InsideCount {
  step: number;
  byVenue: Map<number, number>;
}

const insideCounts = new WeakMap<PersonPool, InsideCount>();

function countInside(pool: PersonPool): Map<number, number> {
  const byVenue = new Map<number, number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (customerTripAt(pool, slot)?.phase !== 'atVenue') continue;
    const venue = pool.homeUnit[slot] as number;
    byVenue.set(venue, (byVenue.get(venue) ?? 0) + 1);
  }
  return byVenue;
}

/** Outside customers inside each venue right now, built once per step and kept up to date. */
function customersInside(state: TowerState): Map<number, number> {
  const cached = insideCounts.get(state.people);
  if (cached && cached.step === state.step) return cached.byVenue;
  const byVenue = countInside(state.people);
  insideCounts.set(state.people, { step: state.step, byVenue });
  return byVenue;
}

/** Outside customers inside this venue right now; people on their way in do not count. */
export function customersInsideVenue(state: TowerState, venue: number): number {
  return customersInside(state).get(venue) ?? 0;
}

export function changeCustomersInside(state: TowerState, venue: number, change: number): void {
  const byVenue = customersInside(state);
  byVenue.set(venue, Math.max(0, (byVenue.get(venue) ?? 0) + change));
}

/** Drops the counts kept for this step, after people were removed outside the usual flow. */
export function forgetCustomersInside(state: TowerState): void {
  insideCounts.delete(state.people);
}
