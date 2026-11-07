import { describe, expect, it } from 'vitest';
import {
  dateOfStep,
  daysInMonth,
  isLeapYear,
  STEPS_PER_HOUR,
  STEPS_PER_MINUTE,
  stepOfDate,
  WEEKDAYS,
  type GameDate,
  type Weekday,
} from './calendar';
import { STEPS_PER_DAY } from './clock';

// Weekday of 1 January (0 = Monday) from a proleptic Gregorian calendar tool.
const JANUARY_FIRST_WEEKDAYS: [year: number, weekday: Weekday][] = [
  [1, 0],
  [26, 3],
  [51, 6],
  [76, 2],
  [100, 4],
  [101, 5],
  [126, 1],
  [151, 4],
  [176, 0],
  [201, 3],
  [226, 6],
  [251, 2],
  [276, 5],
  [301, 1],
  [326, 4],
  [351, 0],
  [376, 3],
  [400, 5],
  [401, 0],
  [426, 3],
  [451, 6],
  [476, 2],
  [501, 5],
  [526, 1],
  [551, 4],
  [576, 0],
  [601, 3],
  [626, 6],
  [651, 2],
  [676, 5],
  [701, 1],
  [726, 4],
  [751, 0],
  [776, 3],
  [801, 0],
  [826, 3],
  [851, 6],
  [876, 2],
  [901, 5],
  [926, 1],
  [951, 4],
  [976, 0],
  [1000, 2],
  [1001, 3],
];

// [year, month, day, weekday, days since 0001-01-01] from the same tool.
const KNOWN_DATES: [number, number, number, Weekday, number][] = [
  [999, 12, 31, 1, 364_876],
  [1000, 1, 1, 2, 364_877],
  [1582, 10, 15, 4, 577_735],
  [1776, 7, 4, 3, 648_490],
  [1900, 3, 1, 3, 693_654],
  [1969, 7, 20, 6, 718_997],
  [2000, 2, 29, 1, 730_178],
  [2024, 12, 24, 1, 739_243],
  [2026, 11, 13, 4, 739_932],
];

function isNextDay(previous: GameDate, current: GameDate): boolean {
  const weekdayAdvances = current.weekday === (previous.weekday + 1) % 7;
  const monthEnded = previous.day === daysInMonth(previous.year, previous.month);
  if (!monthEnded) {
    return weekdayAdvances && current.day === previous.day + 1 && current.month === previous.month;
  }
  const yearEnded = previous.month === 12;
  const expectedMonth = yearEnded ? 1 : previous.month + 1;
  const expectedYear = yearEnded ? previous.year + 1 : previous.year;
  return (
    weekdayAdvances &&
    current.day === 1 &&
    current.month === expectedMonth &&
    current.year === expectedYear
  );
}

describe('dateOfStep', () => {
  it('starts on Monday 1 January of year 1 at midnight', () => {
    expect(dateOfStep(0)).toEqual({
      dayNumber: 0,
      year: 1,
      month: 1,
      day: 1,
      weekday: WEEKDAYS.monday,
      isWeekend: false,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it('reaches Tuesday 2 January after 8640 steps', () => {
    const date = dateOfStep(8_640);
    expect([date.year, date.month, date.day, date.weekday]).toEqual([1, 1, 2, WEEKDAYS.tuesday]);
    expect([date.hour, date.minute]).toEqual([0, 0]);
  });

  it('counts 360 steps per hour and 6 per minute', () => {
    expect(STEPS_PER_HOUR).toBe(360);
    expect(STEPS_PER_MINUTE).toBe(6);
    expect(dateOfStep(360).hour).toBe(1);
    expect(dateOfStep(359)).toMatchObject({ hour: 0, minute: 59, second: 50 });
  });

  it('reads the last step of a day as 23:59:50', () => {
    expect(dateOfStep(STEPS_PER_DAY - 1)).toMatchObject({
      day: 1,
      hour: 23,
      minute: 59,
      second: 50,
    });
  });

  it('marks Saturday and Sunday as the weekend', () => {
    const weekendFlags = Array.from(
      { length: 7 },
      (_, day) => dateOfStep(day * STEPS_PER_DAY).isWeekend,
    );
    expect(weekendFlags).toEqual([false, false, false, false, false, true, true]);
  });

  it('rolls over from 31 December to 1 January', () => {
    const newYear = stepOfDate({ year: 2, month: 1, day: 1 });
    expect(dateOfStep(newYear - 1)).toMatchObject({
      year: 1,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
    });
    expect(dateOfStep(newYear)).toMatchObject({ year: 2, month: 1, day: 1, hour: 0 });
  });

  it.each(JANUARY_FIRST_WEEKDAYS)(
    'gives the right weekday for 1 January of year %i',
    (year, weekday) => {
      expect(dateOfStep(stepOfDate({ year, month: 1, day: 1 })).weekday).toBe(weekday);
    },
  );

  it.each(KNOWN_DATES)(
    'matches the reference for %i-%i-%i',
    (year, month, day, weekday, dayNumber) => {
      const date = dateOfStep(dayNumber * STEPS_PER_DAY + 12 * STEPS_PER_HOUR);
      expect(date).toMatchObject({ year, month, day, weekday, dayNumber, hour: 12 });
    },
  );

  it('advances one calendar day at a time across 1,000 years', () => {
    let previous = dateOfStep(0);
    const lastDay = stepOfDate({ year: 1001, month: 1, day: 1 }) / STEPS_PER_DAY;
    const badDays: number[] = [];
    for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
      const current = dateOfStep(dayNumber * STEPS_PER_DAY);
      if (!isNextDay(previous, current)) badDays.push(dayNumber);
      previous = current;
    }
    expect(badDays).toEqual([]);
    expect(previous).toMatchObject({ year: 1001, month: 1, day: 1 });
  });

  it('rejects negative and fractional steps', () => {
    expect(() => dateOfStep(-1)).toThrow(RangeError);
    expect(() => dateOfStep(1.5)).toThrow(RangeError);
  });
});

describe('leap years', () => {
  it('follows the Gregorian rule', () => {
    expect(isLeapYear(4)).toBe(true);
    expect(isLeapYear(100)).toBe(false);
    expect(isLeapYear(400)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(3)).toBe(false);
  });

  it('has 29 February in year 4 and year 400 but not in year 100', () => {
    expect(dateOfStep(stepOfDate({ year: 4, month: 2, day: 28 }) + STEPS_PER_DAY)).toMatchObject({
      month: 2,
      day: 29,
    });
    expect(dateOfStep(stepOfDate({ year: 400, month: 2, day: 28 }) + STEPS_PER_DAY)).toMatchObject({
      month: 2,
      day: 29,
    });
    expect(dateOfStep(stepOfDate({ year: 100, month: 2, day: 28 }) + STEPS_PER_DAY)).toMatchObject({
      month: 3,
      day: 1,
    });
  });

  it('places 31 December of a leap year on day 366', () => {
    const lastDay = dateOfStep(stepOfDate({ year: 400, month: 12, day: 31 }));
    const firstDay = dateOfStep(stepOfDate({ year: 400, month: 1, day: 1 }));
    expect(lastDay.dayNumber - firstDay.dayNumber + 1).toBe(366);
    expect([lastDay.month, lastDay.day]).toEqual([12, 31]);
  });
});

describe('stepOfDate', () => {
  it('round-trips with dateOfStep', () => {
    const step = stepOfDate({ year: 2026, month: 12, day: 24, hour: 18, minute: 30, second: 20 });
    expect(dateOfStep(step)).toMatchObject({
      year: 2026,
      month: 12,
      day: 24,
      hour: 18,
      minute: 30,
      second: 20,
      weekday: WEEKDAYS.thursday,
    });
  });

  it('rejects dates that do not exist', () => {
    expect(() => stepOfDate({ year: 100, month: 2, day: 29 })).toThrow(RangeError);
    expect(() => stepOfDate({ year: 0, month: 1, day: 1 })).toThrow(RangeError);
    expect(() => stepOfDate({ year: 1, month: 13, day: 1 })).toThrow(RangeError);
  });

  it('rejects times that are not on a step boundary', () => {
    expect(() => stepOfDate({ year: 1, month: 1, day: 1, second: 5 })).toThrow(RangeError);
    expect(() => stepOfDate({ year: 1, month: 1, day: 1, hour: 24 })).toThrow(RangeError);
  });
});
