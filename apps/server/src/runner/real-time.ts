import { STEPS_PER_DAY } from '@tower-magnate/engine';

/** One game day lasts 15 real minutes, so a running tower advances about 9.6 steps a second. */
export const REAL_MS_PER_GAME_DAY = 15 * 60 * 1000;

/** How many whole steps fit in a stretch of real time. */
export function stepsForElapsed(elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.floor((elapsedMs * STEPS_PER_DAY) / REAL_MS_PER_GAME_DAY);
}
