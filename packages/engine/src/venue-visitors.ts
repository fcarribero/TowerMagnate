import { PERSON_KINDS, type PersonPool, type TowerState } from '@tower-magnate/shared';
import { NO_TRIP } from './people';

export const CUSTOMER_KIND = PERSON_KINDS.indexOf('customer');

/** Visitors from outside who share one trip encoding: customers, cinema audience and party guests. */
const VISITOR_KINDS: readonly number[] = [
  CUSTOMER_KIND,
  PERSON_KINDS.indexOf('audience'),
  PERSON_KINDS.indexOf('partyGuest'),
];

export function isOutsideVisitor(pool: PersonPool, slot: number): boolean {
  return VISITOR_KINDS.includes(pool.kind[slot] as number);
}

export type CustomerPhase = 'toVenue' | 'atVenue' | 'leaving';

const CUSTOMER_PHASES: readonly CustomerPhase[] = ['toVenue', 'atVenue', 'leaving'];

/** The door a customer came in by and leaves by: a street end, or a column of the subway station. */
export type CustomerEntrance =
  { kind: 'street'; onRight: boolean } | { kind: 'subway'; column: number };

/** What an outside customer is doing, kept in the person's `trip` number. */
export interface CustomerTrip {
  phase: CustomerPhase;
  entrance: CustomerEntrance;
}

const STREET_LEFT = 0;
const STREET_RIGHT = 1;
const FIRST_SUBWAY_CODE = 2;

function entranceCode(entrance: CustomerEntrance): number {
  if (entrance.kind === 'subway') return FIRST_SUBWAY_CODE + entrance.column;
  return entrance.onRight ? STREET_RIGHT : STREET_LEFT;
}

function entranceOfCode(code: number): CustomerEntrance {
  if (code >= FIRST_SUBWAY_CODE) return { kind: 'subway', column: code - FIRST_SUBWAY_CODE };
  return { kind: 'street', onRight: code === STREET_RIGHT };
}

export function encodeCustomerTrip(trip: CustomerTrip): number {
  const phase = CUSTOMER_PHASES.indexOf(trip.phase);
  return entranceCode(trip.entrance) * CUSTOMER_PHASES.length + phase + 1;
}

export function customerTripAt(pool: PersonPool, slot: number): CustomerTrip | null {
  if (!isOutsideVisitor(pool, slot)) return null;
  const packed = pool.trip[slot] ?? NO_TRIP;
  if (packed === NO_TRIP) return null;
  const phase = CUSTOMER_PHASES[(packed - 1) % CUSTOMER_PHASES.length];
  if (!phase) return null;
  const code = Math.floor((packed - 1) / CUSTOMER_PHASES.length);
  return { phase, entrance: entranceOfCode(code) };
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

/** Outside visitors inside each venue right now, built once per step and kept up to date. */
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
