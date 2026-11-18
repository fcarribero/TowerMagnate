import {
  STRESS_SCORE_PINK_FROM,
  STRESS_SCORE_RED_FROM,
  STRESS_WINDOW_STEPS,
  stressScore,
  VENUE_FACTOR_PER_POINT,
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
  return averageStress(sum, count, stressSoFar);
}

/** Person stress from the sum and count of the ended trips in the window. */
export function averageStress(sum: number, count: number, stressSoFar: number | null): number {
  if (stressSoFar !== null) {
    sum += stressSoFar;
    count += 1;
  }
  return count === 0 ? 0 : Math.floor(sum / count);
}

/** The tint people are drawn with, picked from the 0 to 10 score; display only. */
export function stressBand(stress: number): StressBand {
  const score = stressScore(stress);
  if (score >= STRESS_SCORE_RED_FROM) return 'muy alto';
  if (score >= STRESS_SCORE_PINK_FROM) return 'alto';
  return 'normal';
}

/** Venue factor from the average trip stress at its door the day before: 1 − 0.04 per point. */
export function venueStressFactor(averageStress: number): number {
  return 1 - VENUE_FACTOR_PER_POINT * stressScore(averageStress);
}
