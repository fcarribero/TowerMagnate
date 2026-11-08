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

export type SkyTime = 'day' | 'dusk' | 'night';

const SUNRISE_END_HOUR = 7;
const SUNSET_START_HOUR = 19;

/** The sky is dusk for the hour after dawn and the hour before night, so it matches the unit variants. */
export function skyTimeAt(step: number): SkyTime {
  const hour = (step % STEPS_PER_DAY) / STEPS_PER_HOUR;
  if (hour >= DUSK_HOUR || hour < DAWN_HOUR) {
    return 'night';
  }
  return hour < SUNRISE_END_HOUR || hour >= SUNSET_START_HOUR ? 'dusk' : 'day';
}
