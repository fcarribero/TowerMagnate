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

export interface SkyPhase {
  /** The look the sky is leaving. */
  from: SkyTime;
  /** The look it is heading to; the same as `from` while the sky holds still. */
  to: SkyTime;
  /** How far the sky is from `from` to `to`, in steps of 1/32. */
  mix: number;
}

const MIX_STEPS = 32;

/** Hours at which the sky has a full look. Between two keys it fades from one to the next. */
const SKY_KEYS: ReadonlyArray<{ hour: number; time: SkyTime }> = [
  { hour: 0, time: 'night' },
  { hour: 4, time: 'night' },
  { hour: 6, time: 'dusk' },
  { hour: 8, time: 'day' },
  { hour: 17, time: 'day' },
  { hour: 19, time: 'dusk' },
  { hour: 21, time: 'night' },
  { hour: 24, time: 'night' },
];

/** The sky at `step`: night turns to dusk and then day over two hours each, and back in the evening. */
export function skyPhaseAt(step: number): SkyPhase {
  const hour = (step % STEPS_PER_DAY) / STEPS_PER_HOUR;
  for (let index = 1; index < SKY_KEYS.length; index += 1) {
    const next = SKY_KEYS[index];
    const last = SKY_KEYS[index - 1];
    if (next === undefined || last === undefined || hour >= next.hour) {
      continue;
    }
    if (last.time === next.time) {
      return { from: last.time, to: last.time, mix: 0 };
    }
    const mix = Math.round(((hour - last.hour) / (next.hour - last.hour)) * MIX_STEPS) / MIX_STEPS;
    return { from: last.time, to: next.time, mix };
  }
  return { from: 'night', to: 'night', mix: 0 };
}
