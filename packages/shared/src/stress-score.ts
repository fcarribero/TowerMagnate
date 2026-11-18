import { STRESS_SCORE_MAX, STRESS_SCORE_SCALE_STEPS } from './balance';

/**
 * Stress as a score from 0 to 10 (stress-evaluation 3.2): `10 × (1 − e^(−steps / 180))`. Trips
 * still record steps; this is how any stress in steps, or an average of it, reads to the player
 * and to the rules. The score rises fast over the usual trip lengths and never reaches 10.
 */
export function stressScore(steps: number): number {
  if (steps <= 0) return 0;
  return STRESS_SCORE_MAX * (1 - Math.exp(-steps / STRESS_SCORE_SCALE_STEPS));
}
