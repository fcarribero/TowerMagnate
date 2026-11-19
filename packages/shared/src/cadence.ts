/** Real milliseconds between two deltas when the tower runs at normal speed. */
export const BASE_DELTA_INTERVAL_MS = 200;

/** Deltas never come closer together than this, however fast the tower runs. */
export const FASTEST_DELTA_INTERVAL_MS = 50;

/**
 * Real milliseconds between two deltas at a game speed. A faster tower sends them more often, so
 * each one covers about as much game time as at normal speed and the client can draw it smoothly.
 */
export function deltaIntervalMs(speed: number): number {
  if (speed <= 1) return BASE_DELTA_INTERVAL_MS;
  return Math.max(FASTEST_DELTA_INTERVAL_MS, Math.round(BASE_DELTA_INTERVAL_MS / speed));
}
