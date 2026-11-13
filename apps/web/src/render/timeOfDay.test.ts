import { describe, expect, it } from 'vitest';
import { skyPhaseAt, skyTimeAt, stepAtHour, timeOfDayAt } from './timeOfDay';

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

describe('skyPhaseAt', () => {
  it('holds still at full night and full day', () => {
    expect(skyPhaseAt(stepAtHour(2))).toEqual({ from: 'night', to: 'night', mix: 0 });
    expect(skyPhaseAt(stepAtHour(12))).toEqual({ from: 'day', to: 'day', mix: 0 });
  });

  it('fades from night through dusk to day in the morning', () => {
    expect(skyPhaseAt(stepAtHour(5))).toEqual({ from: 'night', to: 'dusk', mix: 0.5 });
    expect(skyPhaseAt(stepAtHour(7))).toEqual({ from: 'dusk', to: 'day', mix: 0.5 });
  });

  it('fades from day through dusk to night in the evening', () => {
    expect(skyPhaseAt(stepAtHour(18))).toEqual({ from: 'day', to: 'dusk', mix: 0.5 });
    expect(skyPhaseAt(stepAtHour(20))).toEqual({ from: 'dusk', to: 'night', mix: 0.5 });
  });
});
