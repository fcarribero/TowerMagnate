import {
  isWeekendDay,
  STEPS_PER_HOUR,
  STEPS_PER_MINUTE,
  weekdayOfDay,
  type Weekday,
} from './calendar';
import { STEPS_PER_DAY } from './clock';
import type { SimulationSystem, StepContext } from './step';

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export type HookSchedule =
  | ({ every: 'day' } & TimeOfDay)
  | ({ every: 'weekday' } & TimeOfDay)
  | ({ every: 'week'; weekday: Weekday } & TimeOfDay);

export interface HookOccurrence {
  step: number;
  dayNumber: number;
  weekday: Weekday;
}

export interface ScheduledHook {
  name: string;
  schedule: HookSchedule;
  run(context: StepContext, occurrence: HookOccurrence): void;
}

/**
 * Builds a system that runs each hook at its scheduled game time. Hooks due at the same step run
 * in the order they are listed.
 */
export function createScheduler(hooks: readonly ScheduledHook[]): SimulationSystem {
  assertUniqueNames(hooks);
  const hooksByStepOfDay = new Map<number, ScheduledHook[]>();
  for (const hook of hooks) {
    const stepOfDay = stepOfTimeOfDay(hook.schedule, hook.name);
    const due = hooksByStepOfDay.get(stepOfDay) ?? [];
    due.push(hook);
    hooksByStepOfDay.set(stepOfDay, due);
  }

  return (context) => {
    const step = context.state.step;
    const due = hooksByStepOfDay.get(step % STEPS_PER_DAY);
    if (!due) {
      return;
    }
    const dayNumber = Math.floor(step / STEPS_PER_DAY);
    const weekday = weekdayOfDay(dayNumber);
    const occurrence: HookOccurrence = { step, dayNumber, weekday };
    for (const hook of due) {
      if (runsOn(hook.schedule, weekday)) {
        hook.run(context, occurrence);
      }
    }
  };
}

function runsOn(schedule: HookSchedule, weekday: Weekday): boolean {
  switch (schedule.every) {
    case 'day':
      return true;
    case 'weekday':
      return !isWeekendDay(weekday);
    case 'week':
      return schedule.weekday === weekday;
  }
}

function stepOfTimeOfDay(schedule: HookSchedule, name: string): number {
  const { hour, minute } = schedule;
  const validTime =
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour < 24 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute < 60;
  if (!validTime) {
    throw new RangeError(`Hook ${name} has an invalid time ${hour}:${minute}`);
  }
  if (schedule.every === 'week' && !isWeekday(schedule.weekday)) {
    throw new RangeError(`Hook ${name} has an invalid weekday ${schedule.weekday}`);
  }
  return hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function assertUniqueNames(hooks: readonly ScheduledHook[]): void {
  const seen = new Set<string>();
  for (const hook of hooks) {
    if (seen.has(hook.name)) {
      throw new Error(`Hook ${hook.name} is scheduled twice`);
    }
    seen.add(hook.name);
  }
}
