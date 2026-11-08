import { STEPS_PER_MINUTE, stepOfDate } from '@tower-magnate/engine/calendar';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../money';
import {
  filledStars,
  formatCount,
  formatGameDate,
  formatGameTime,
  formatPopulation,
  gameMinuteOfStep,
  isTowerRank,
  stepOfGameMinute,
} from './statusFormat';

describe('status bar formats', () => {
  it('starts a tower on Lunes 1 de enero, año 1 at 00:00', () => {
    expect(formatGameDate(0)).toEqual({ text: 'Lunes 1 de enero, año 1', isWeekend: false });
    expect(formatGameTime(0)).toBe('00:00');
  });

  it('writes a later date and time', () => {
    const step = stepOfDate({ year: 3, month: 11, day: 11, hour: 14, minute: 35 });
    expect(formatGameDate(step).text).toBe('Martes 11 de noviembre, año 3');
    expect(formatGameTime(step)).toBe('14:35');
  });

  it('marks Saturday and Sunday as weekend', () => {
    const saturday = stepOfDate({ year: 1, month: 1, day: 6 });
    const sunday = stepOfDate({ year: 1, month: 1, day: 7, hour: 23, minute: 59 });
    const monday = stepOfDate({ year: 1, month: 1, day: 8 });
    expect(formatGameDate(saturday)).toEqual({
      text: 'Sábado 6 de enero, año 1',
      isWeekend: true,
    });
    expect(formatGameDate(sunday).isWeekend).toBe(true);
    expect(formatGameDate(monday).isWeekend).toBe(false);
  });

  it('truncates the time to the game minute', () => {
    const lastStepOfMinute = stepOfDate({ year: 1, month: 1, day: 1, hour: 9, minute: 59 }) + 5;
    expect(formatGameTime(lastStepOfMinute)).toBe('09:59');
    expect(formatGameTime(lastStepOfMinute + 1)).toBe('10:00');
  });

  it('counts whole game minutes', () => {
    expect(gameMinuteOfStep(STEPS_PER_MINUTE - 1)).toBe(0);
    expect(gameMinuteOfStep(STEPS_PER_MINUTE)).toBe(1);
    expect(stepOfGameMinute(gameMinuteOfStep(STEPS_PER_MINUTE * 7 + 3))).toBe(STEPS_PER_MINUTE * 7);
  });

  it('formats money as the acceptance asks', () => {
    expect(formatMoney(1_234_567)).toBe('$1.234.567');
    expect(formatMoney(-12_500)).toBe('-$12.500');
  });

  it('writes population with thousands separators', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatPopulation(15_300)).toBe('Población 15.300');
    expect(formatPopulation(0)).toBe('Población 0');
  });

  it('fills 5 star slots at most and calls rank 6 the tower rank', () => {
    expect(filledStars(1)).toBe(1);
    expect(filledStars(5)).toBe(5);
    expect(filledStars(6)).toBe(5);
    expect(isTowerRank(5)).toBe(false);
    expect(isTowerRank(6)).toBe(true);
  });
});
