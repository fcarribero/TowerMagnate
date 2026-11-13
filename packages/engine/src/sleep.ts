import {
  NIGHT_PIVOT_MINUTE,
  WAKE_DELAY_MINUTES,
  type TowerState,
  type WindowPart,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE, WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { nextInt } from './rng';
import { drawMinuteFromWindow } from './time-windows';

/** A bed or wake window, and the longer one used after a Friday or Saturday night. */
export interface SleepWindows {
  usual: readonly WindowPart[];
  long: readonly WindowPart[];
}

const NOON_MINUTE = 12 * 60;

function dayOf(step: number): number {
  return Math.floor(step / STEPS_PER_DAY);
}

function minuteOf(step: number): number {
  return Math.floor((step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function weekdayOf(day: number) {
  return weekdayOfDay(((day % 7) + 7) % 7);
}

function isLongNight(day: number): boolean {
  const weekday = weekdayOf(day);
  return weekday === WEEKDAYS.friday || weekday === WEEKDAYS.saturday;
}

/**
 * Draws the step a person goes to bed, never before `now`. The night belongs to the day it began
 * on, so just after midnight it still counts as the night before.
 */
export function drawBedStep(state: TowerState, now: number, windows: SleepWindows): number {
  const night = minuteOf(now) < NIGHT_PIVOT_MINUTE ? dayOf(now) - 1 : dayOf(now);
  const minute = drawMinuteFromWindow(state.rng, isLongNight(night) ? windows.long : windows.usual);
  return Math.max(now, night * STEPS_PER_DAY + minute * STEPS_PER_MINUTE);
}

/**
 * Draws the step a person who goes to bed at `bedStep` wakes. A bed time before noon belongs to
 * the morning of the same day, a later one to the next morning. The long window is used for
 * Saturday and Sunday mornings.
 */
export function drawWakeStep(state: TowerState, bedStep: number, windows: SleepWindows): number {
  const wakeDay = minuteOf(bedStep) < NOON_MINUTE ? dayOf(bedStep) : dayOf(bedStep) + 1;
  const weekday = weekdayOf(wakeDay);
  const weekend = weekday === WEEKDAYS.saturday || weekday === WEEKDAYS.sunday;
  const minute = drawMinuteFromWindow(state.rng, weekend ? windows.long : windows.usual);
  return Math.max(wakeDay * STEPS_PER_DAY + minute * STEPS_PER_MINUTE, bedStep + STEPS_PER_MINUTE);
}

/** Steps between waking and the first thing of the day. */
export function drawWakeDelay(state: TowerState): number {
  return nextInt(state.rng, WAKE_DELAY_MINUTES.min, WAKE_DELAY_MINUTES.max) * STEPS_PER_MINUTE;
}
