import { describe, expect, it } from 'vitest';
import { stepAtHour, timeOfDayAt } from './timeOfDay';

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
