import { describe, expect, it } from 'vitest';
import { skyTimeAt, stepAtHour, timeOfDayAt } from './timeOfDay';

describe('timeOfDayAt', () => {
  it('is night from 20:00 to 06:00 and day between', () => {
    expect(timeOfDayAt(stepAtHour(0))).toBe('night');
    expect(timeOfDayAt(stepAtHour(5.9))).toBe('night');
    expect(timeOfDayAt(stepAtHour(6))).toBe('day');
    expect(timeOfDayAt(stepAtHour(19.9))).toBe('day');
    expect(timeOfDayAt(stepAtHour(20))).toBe('night');
  });

  it('repeats every game day', () => {
    expect(timeOfDayAt(8640 * 3 + stepAtHour(12))).toBe('day');
    expect(timeOfDayAt(8640 * 3 + stepAtHour(23))).toBe('night');
  });
});

describe('skyTimeAt', () => {
  it('is dusk for the hour after dawn and the hour before night', () => {
    expect(skyTimeAt(stepAtHour(5.9))).toBe('night');
    expect(skyTimeAt(stepAtHour(6))).toBe('dusk');
    expect(skyTimeAt(stepAtHour(6.9))).toBe('dusk');
    expect(skyTimeAt(stepAtHour(7))).toBe('day');
    expect(skyTimeAt(stepAtHour(18.9))).toBe('day');
    expect(skyTimeAt(stepAtHour(19))).toBe('dusk');
    expect(skyTimeAt(stepAtHour(20))).toBe('night');
  });

  it('has no gap at the day change', () => {
    expect(skyTimeAt(8640 - 1)).toBe('night');
    expect(skyTimeAt(8640)).toBe('night');
    expect(skyTimeAt(8640 * 2 + stepAtHour(12))).toBe('day');
  });
});
