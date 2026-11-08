import type { TimeOfDay } from './structurePlan';

const STEPS_PER_HOUR = 360;
const STEPS_PER_DAY = 24 * STEPS_PER_HOUR;
const DAWN_HOUR = 6;
const DUSK_HOUR = 20;

/** Night runs from 20:00 to 06:00 of game time. Step 0 is midnight. */
export function timeOfDayAt(step: number): TimeOfDay {
  const hour = (step % STEPS_PER_DAY) / STEPS_PER_HOUR;
  return hour >= DAWN_HOUR && hour < DUSK_HOUR ? 'day' : 'night';
}

export function stepAtHour(hour: number): number {
  return hour * STEPS_PER_HOUR;
}
