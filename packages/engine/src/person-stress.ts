import {
  STRESS_ALTO_FROM,
  STRESS_MUY_ALTO_FROM,
  STRESS_WINDOW_STEPS,
  VENUE_STRESS_FACTOR_ALTO,
  VENUE_STRESS_FACTOR_MUY_ALTO,
  VENUE_STRESS_FACTOR_NORMAL,
} from '@tower-magnate/shared';

export type StressBand = 'normal' | 'alto' | 'muy alto';

export interface RecordedTrip {
  /** Step at which the trip ended, was given up or was reset. */
  endStep: number;
  /** Trip stress T in steps, already capped at 540. */
  stress: number;
}

/** A trip ended at step `e` is in the window of step `s` when `e >= s - 60,480`. */
function isInWindow(trip: RecordedTrip, step: number): boolean {
  return trip.endStep >= step - STRESS_WINDOW_STEPS && trip.endStep <= step;
}

/**
 * Person stress P: the average of the trips ended in the last week, plus the trip in progress
 * when `stressSoFar` is given. A person with no trips and no trip in progress has 0.
 */
export function personStress(
  trips: readonly RecordedTrip[],
  step: number,
  stressSoFar: number | null = null,
): number {
  let sum = 0;
  let count = 0;
  for (const trip of trips) {
    if (isInWindow(trip, step)) {
      sum += trip.stress;
      count += 1;
    }
  }
  if (stressSoFar !== null) {
    sum += stressSoFar;
    count += 1;
  }
  return count === 0 ? 0 : Math.floor(sum / count);
}

export function stressBand(stress: number): StressBand {
  if (stress >= STRESS_MUY_ALTO_FROM) return 'muy alto';
  if (stress >= STRESS_ALTO_FROM) return 'alto';
  return 'normal';
}

/** Venue factor from the average trip stress at its door the day before; 1 with no trips. */
export function venueStressFactor(averageStress: number): number {
  const band = stressBand(averageStress);
  if (band === 'muy alto') return VENUE_STRESS_FACTOR_MUY_ALTO;
  if (band === 'alto') return VENUE_STRESS_FACTOR_ALTO;
  return VENUE_STRESS_FACTOR_NORMAL;
}
