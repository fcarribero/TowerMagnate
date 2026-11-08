import {
  STRESS_ESCALATOR_FLOOR,
  STRESS_LONG_TRIP,
  STRESS_NO_ROUTE,
  STRESS_QUEUE_FULL,
  STRESS_STAIR_FLOOR,
  STRESS_TALL_LOBBY_CUT,
  STRESS_TRIP_CAP,
} from '@tower-magnate/shared';

export interface RideStress {
  shaftKind: 'standard' | 'service' | 'express';
  waitSteps: number;
  rideSteps: number;
  rideFloors: number;
  direction: 'up' | 'down';
  /** Height of the lobby level the ride boards on, or null when it boards outside a lobby. */
  boardingLobbyHeight: number | null;
}

/** The leg data of one trip, as recorded from routing and elevators. */
export interface TripStressParts {
  rides: readonly RideStress[];
  stairFloors: number;
  escalatorFloors: number;
  fullQueueEvents: number;
  failedSearches: number;
  /** True when the 03:00 night reset ended the trip. */
  nightReset: boolean;
}

export function emptyTripParts(): TripStressParts {
  return {
    rides: [],
    stairFloors: 0,
    escalatorFloors: 0,
    fullQueueEvents: 0,
    failedSearches: 0,
    nightReset: false,
  };
}

/** The wait counted for stress: an up ride from a tall lobby loses part of it, never below 0. */
function countedWait(ride: RideStress): number {
  if (ride.direction !== 'up' || ride.boardingLobbyHeight === null) return ride.waitSteps;
  const cut = STRESS_TALL_LOBBY_CUT[ride.boardingLobbyHeight] ?? 0;
  return Math.max(0, ride.waitSteps - cut);
}

/** Standard and service ride floors plus stair floors; express and escalators add none. */
function slowFloors(parts: TripStressParts): number {
  let floors = parts.stairFloors;
  for (const ride of parts.rides) {
    if (ride.shaftKind !== 'express') floors += ride.rideFloors;
  }
  return floors;
}

function longTripExtra(floors: number): number {
  return STRESS_LONG_TRIP.find((row) => floors >= row.from)?.extra ?? 0;
}

function partsSum(parts: TripStressParts): number {
  const failed = parts.failedSearches + (parts.nightReset ? 1 : 0);
  let sum =
    parts.stairFloors * STRESS_STAIR_FLOOR +
    parts.escalatorFloors * STRESS_ESCALATOR_FLOOR +
    parts.fullQueueEvents * STRESS_QUEUE_FULL +
    failed * STRESS_NO_ROUTE;
  for (const ride of parts.rides) sum += countedWait(ride) + ride.rideSteps;
  return sum;
}

/** Stress so far for person stress: no long-trip extra, capped like a finished trip. */
export function tripStressSoFar(parts: TripStressParts): number {
  return Math.min(STRESS_TRIP_CAP, partsSum(parts));
}

/** Trip stress T in steps (SE-01 to SE-05). */
export function tripStress(parts: TripStressParts): number {
  return Math.min(STRESS_TRIP_CAP, partsSum(parts) + longTripExtra(slowFloors(parts)));
}
