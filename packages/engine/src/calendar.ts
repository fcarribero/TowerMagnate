import { SECONDS_PER_STEP, STEPS_PER_DAY } from './clock';

export const STEPS_PER_MINUTE = 60 / SECONDS_PER_STEP;
export const STEPS_PER_HOUR = 60 * STEPS_PER_MINUTE;
export const DAYS_PER_WEEK = 7;

const DAYS_PER_400_YEARS = 146_097;
const DAYS_PER_100_YEARS = 36_524;
const DAYS_PER_4_YEARS = 1_461;
const DAYS_PER_YEAR = 365;

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
} as const satisfies Record<string, Weekday>;

export interface GameDate {
  /** Whole days since Monday 1 January of year 1. */
  dayNumber: number;
  year: number;
  /** 1 for January, 12 for December. */
  month: number;
  day: number;
  weekday: Weekday;
  isWeekend: boolean;
  hour: number;
  minute: number;
  second: number;
}

export interface CalendarDateTime {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function weekdayOfDay(dayNumber: number): Weekday {
  return (dayNumber % DAYS_PER_WEEK) as Weekday;
}

export function isWeekendDay(weekday: Weekday): boolean {
  return weekday === WEEKDAYS.saturday || weekday === WEEKDAYS.sunday;
}

export function dateOfStep(step: number): GameDate {
  assertStep(step);
  const dayNumber = Math.floor(step / STEPS_PER_DAY);
  const secondOfDay = (step % STEPS_PER_DAY) * SECONDS_PER_STEP;
  const { year, month, day } = civilDateOfDay(dayNumber);
  const weekday = weekdayOfDay(dayNumber);
  return {
    dayNumber,
    year,
    month,
    day,
    weekday,
    isWeekend: isWeekendDay(weekday),
    hour: Math.floor(secondOfDay / 3600),
    minute: Math.floor((secondOfDay % 3600) / 60),
    second: secondOfDay % 60,
  };
}

export function stepOfDate(date: CalendarDateTime): number {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = date;
  assertDate(year, month, day);
  assertTime(hour, minute, second);
  const dayNumber = dayOfCivilDate(year, month, day);
  const secondOfDay = hour * 3600 + minute * 60 + second;
  return dayNumber * STEPS_PER_DAY + secondOfDay / SECONDS_PER_STEP;
}

function civilDateOfDay(dayNumber: number): { year: number; month: number; day: number } {
  let remaining = dayNumber;

  const cycles400 = Math.floor(remaining / DAYS_PER_400_YEARS);
  remaining -= cycles400 * DAYS_PER_400_YEARS;

  // The fourth century of a cycle is one day longer, so its last day caps at 3.
  const centuries = Math.min(Math.floor(remaining / DAYS_PER_100_YEARS), 3);
  remaining -= centuries * DAYS_PER_100_YEARS;

  const cycles4 = Math.floor(remaining / DAYS_PER_4_YEARS);
  remaining -= cycles4 * DAYS_PER_4_YEARS;

  // Same for the leap year that closes a 4-year cycle.
  const years = Math.min(Math.floor(remaining / DAYS_PER_YEAR), 3);
  remaining -= years * DAYS_PER_YEAR;

  const year = 1 + cycles400 * 400 + centuries * 100 + cycles4 * 4 + years;
  let month = 1;
  while (remaining >= daysInMonth(year, month)) {
    remaining -= daysInMonth(year, month);
    month += 1;
  }
  return { year, month, day: remaining + 1 };
}

function dayOfCivilDate(year: number, month: number, day: number): number {
  const previousYears = year - 1;
  const leapDaysBefore =
    Math.floor(previousYears / 4) -
    Math.floor(previousYears / 100) +
    Math.floor(previousYears / 400);
  const leapDayThisYear = month > 2 && isLeapYear(year) ? 1 : 0;
  return (
    previousYears * DAYS_PER_YEAR +
    leapDaysBefore +
    (DAYS_BEFORE_MONTH[month - 1] ?? 0) +
    leapDayThisYear +
    day -
    1
  );
}

function assertStep(step: number): void {
  if (!Number.isSafeInteger(step) || step < 0) {
    throw new RangeError(`Step must be a non-negative integer, got ${step}`);
  }
}

function assertDate(year: number, month: number, day: number): void {
  const valid =
    Number.isInteger(year) &&
    year >= 1 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysInMonth(year, month);
  if (!valid) {
    throw new RangeError(`Invalid calendar date ${year}-${month}-${day}`);
  }
}

function assertTime(hour: number, minute: number, second: number): void {
  const valid =
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour < 24 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute < 60 &&
    Number.isInteger(second) &&
    second >= 0 &&
    second < 60 &&
    second % SECONDS_PER_STEP === 0;
  if (!valid) {
    throw new RangeError(`Invalid time of day ${hour}:${minute}:${second}`);
  }
}
