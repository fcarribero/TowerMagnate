import { stepOfDate } from '@tower-magnate/engine/calendar';
import type { ShaftSchedule } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  bandInForce,
  bandRanges,
  copyDay,
  draftOf,
  parseDwell,
  parseResponse,
  parseSchedule,
  scheduleChanged,
  updateBand,
} from './scheduleDraft';

const band = { mode: 'normal', dwellSeconds: 30, responseDistance: 5 } as const;
const schedule: ShaftSchedule = {
  weekday: Array.from({ length: 6 }, () => ({ ...band })),
  weekend: Array.from({ length: 6 }, () => ({ ...band })),
};

describe('scheduleDraft', () => {
  it('labels the six bands from 00:00 to 24:00', () => {
    expect(bandRanges()).toEqual([
      { from: '00:00', to: '07:00' },
      { from: '07:00', to: '10:00' },
      { from: '10:00', to: '12:00' },
      { from: '12:00', to: '14:00' },
      { from: '14:00', to: '17:00' },
      { from: '17:00', to: '24:00' },
    ]);
  });

  it('accepts dwell from 0 to 60 in steps of 10 only', () => {
    expect(parseDwell('0')).toBe(0);
    expect(parseDwell('60')).toBe(60);
    expect(parseDwell('25')).toBeNull();
    expect(parseDwell('70')).toBeNull();
    expect(parseDwell('')).toBeNull();
    expect(parseDwell('-10')).toBeNull();
  });

  it('accepts response distance from 1 to 99 only', () => {
    expect(parseResponse('1')).toBe(1);
    expect(parseResponse('99')).toBe(99);
    expect(parseResponse('0')).toBeNull();
    expect(parseResponse('100')).toBeNull();
    expect(parseResponse('2.5')).toBeNull();
  });

  it('round-trips a schedule through the draft', () => {
    expect(parseSchedule(draftOf(schedule))).toEqual(schedule);
    expect(scheduleChanged(schedule, draftOf(schedule))).toBe(false);
  });

  it('gives no schedule while a field is out of range', () => {
    const draft = updateBand(draftOf(schedule), 'weekend', 5, { response: '100' });
    expect(parseSchedule(draft)).toBeNull();
    expect(scheduleChanged(schedule, draft)).toBe(true);
  });

  it('copies one day type onto the other', () => {
    const draft = updateBand(draftOf(schedule), 'weekday', 1, { mode: 'expressUp' });
    expect(copyDay(draft, 'weekday').weekend[1]?.mode).toBe('expressUp');
  });

  it('finds the band in force on a weekday and on the weekend', () => {
    // 2027-01-18 is a Monday and 2027-01-23 a Saturday.
    const mondayMorning = stepOfDate({ year: 2027, month: 1, day: 18, hour: 7, minute: 0 });
    const saturdayNight = stepOfDate({ year: 2027, month: 1, day: 23, hour: 23, minute: 59 });
    const mondayEarly = stepOfDate({ year: 2027, month: 1, day: 18, hour: 6, minute: 59 });
    expect(bandInForce(mondayMorning)).toEqual({ dayType: 'weekday', index: 1 });
    expect(bandInForce(mondayEarly)).toEqual({ dayType: 'weekday', index: 0 });
    expect(bandInForce(saturdayNight)).toEqual({ dayType: 'weekend', index: 5 });
  });
});
