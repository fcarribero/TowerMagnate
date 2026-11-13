import { describe, expect, it } from 'vitest';
import { stepOfDate } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { STEPS_PER_HOUR } from './calendar';
import {
  BLOCKS_PER_DAY,
  STEPS_PER_BLOCK,
  conditionAt,
  forecast,
  forecastDay,
  seasonOfMonth,
  seasonOfStep,
  temperatureAt,
  weatherAt,
  type WeatherCondition,
} from './weather';

const at = (month: number, day: number, hour = 0) =>
  stepOfDate({ year: 1, month, day, hour, minute: 0, second: 0 });

describe('seasons', () => {
  it('follow the calendar month in the southern hemisphere', () => {
    expect([12, 1, 2].map(seasonOfMonth)).toEqual(['summer', 'summer', 'summer']);
    expect([3, 4, 5].map(seasonOfMonth)).toEqual(['autumn', 'autumn', 'autumn']);
    expect([6, 7, 8].map(seasonOfMonth)).toEqual(['winter', 'winter', 'winter']);
    expect([9, 10, 11].map(seasonOfMonth)).toEqual(['spring', 'spring', 'spring']);
  });

  it('are read from the date of a step', () => {
    expect(seasonOfStep(0)).toBe('summer');
    expect(seasonOfStep(at(3, 1))).toBe('autumn');
    expect(seasonOfStep(at(8, 31, 23))).toBe('winter');
    expect(seasonOfStep(at(12, 1))).toBe('summer');
  });
});

describe('temperature', () => {
  function hourlyDay(month: number, day: number): number[] {
    const first = at(month, day);
    return Array.from({ length: 24 * 6 }, (_, i) =>
      temperatureAt(first + i * (STEPS_PER_HOUR / 6)),
    );
  }

  it('is coldest just before dawn and warmest mid afternoon', () => {
    for (const [month, day] of [
      [1, 10],
      [4, 20],
      [7, 15],
      [10, 5],
    ] as const) {
      const samples = hourlyDay(month, day);
      const lowHour = samples.indexOf(Math.min(...samples)) / 6;
      const highHour = samples.indexOf(Math.max(...samples)) / 6;
      expect(lowHour, `${month}/${day} low`).toBeGreaterThanOrEqual(4);
      expect(lowHour, `${month}/${day} low`).toBeLessThanOrEqual(6);
      expect(highHour, `${month}/${day} high`).toBeGreaterThanOrEqual(14);
      expect(highHour, `${month}/${day} high`).toBeLessThanOrEqual(16);
    }
  });

  it('changes smoothly from step to step, even across midnight', () => {
    let last = temperatureAt(0);
    for (let step = 1; step < STEPS_PER_DAY * 20; step += 1) {
      const now = temperatureAt(step);
      expect(Math.abs(now - last)).toBeLessThan(0.1);
      last = now;
    }
  });

  it('is warmer in summer than in winter', () => {
    const mean = (month: number) => {
      const values = Array.from(
        { length: 28 },
        (_, i) => hourlyDay(month, i + 1).reduce((a, b) => a + b, 0) / 144,
      );
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    expect(mean(1)).toBeGreaterThan(mean(7) + 9);
    expect(mean(1)).toBeGreaterThan(mean(4));
    expect(mean(4)).toBeGreaterThan(mean(7));
    expect(mean(10)).toBeGreaterThan(mean(7));
    expect(mean(1)).toBeGreaterThan(21);
    expect(mean(1)).toBeLessThan(28);
    expect(mean(7)).toBeGreaterThan(8);
    expect(mean(7)).toBeLessThan(15);
  });

  it('stays in a realistic range over a year', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let step = 0; step < STEPS_PER_DAY * 365; step += STEPS_PER_HOUR) {
      const value = temperatureAt(step);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeGreaterThan(-10);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(24);
    expect(max).toBeLessThan(40);
  });
});

describe('conditions', () => {
  const blocks = 365 * BLOCKS_PER_DAY * 3;
  const counts: Record<WeatherCondition, number> = { sunny: 0, cloudy: 0, rain: 0 };
  const runs: number[] = [];
  let run = 0;
  let previous: WeatherCondition | null = null;
  for (let block = 0; block < blocks; block += 1) {
    const condition = conditionAt(block * STEPS_PER_BLOCK);
    counts[condition] += 1;
    if (condition === 'rain') {
      run += 1;
    } else if (previous === 'rain') {
      runs.push(run);
      run = 0;
    }
    previous = condition;
  }

  it('mix sun, clouds and rain over the years', () => {
    expect(counts.sunny / blocks).toBeGreaterThan(0.3);
    expect(counts.cloudy / blocks).toBeGreaterThan(0.15);
    expect(counts.rain / blocks).toBeGreaterThan(0.05);
    expect(counts.rain / blocks).toBeLessThan(0.3);
  });

  it('hold for a whole block, so rain lasts hours and does not flicker', () => {
    const block = 37 * STEPS_PER_BLOCK;
    const first = conditionAt(block);
    for (let step = block; step < block + STEPS_PER_BLOCK; step += 7) {
      expect(conditionAt(step)).toBe(first);
    }
    expect(Math.min(...runs)).toBeGreaterThanOrEqual(1);
    expect(runs.some((length) => length >= 2)).toBe(true);
  });

  it('rain more often in autumn than in winter', () => {
    const share = (months: number[]) => {
      let rain = 0;
      let total = 0;
      for (const month of months) {
        for (let year = 1; year <= 3; year += 1) {
          const first = stepOfDate({ year, month, day: 1 });
          for (let block = 0; block < 28 * BLOCKS_PER_DAY; block += 1) {
            total += 1;
            if (conditionAt(first + block * STEPS_PER_BLOCK) === 'rain') rain += 1;
          }
        }
      }
      return rain / total;
    };
    expect(share([3, 4, 5])).toBeGreaterThan(share([6, 7, 8]));
  });

  it('are cooler under rain than under sun on the afternoon of similar days', () => {
    const afternoon = (condition: WeatherCondition) => {
      const values: number[] = [];
      for (let day = 150; day < 250; day += 1) {
        const step = day * STEPS_PER_DAY + 15 * STEPS_PER_HOUR;
        if (conditionAt(step) === condition) values.push(temperatureAt(step));
      }
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    expect(afternoon('sunny')).toBeGreaterThan(afternoon('rain') + 2);
  });
});

describe('determinism and seed', () => {
  it('gives the same reading for the same step, in any order', () => {
    const steps = [0, 5000, 123_456, STEPS_PER_DAY * 400 + 77];
    const forward = steps.map((step) => weatherAt(step));
    const backward = [...steps]
      .reverse()
      .map((step) => weatherAt(step))
      .reverse();
    expect(backward).toEqual(forward);
  });

  it('changes with another seed', () => {
    const differs = Array.from({ length: 200 }, (_, i) => i * STEPS_PER_BLOCK).some(
      (step) => conditionAt(step, 1) !== conditionAt(step, 2),
    );
    expect(differs).toBe(true);
  });

  it('marks the night', () => {
    expect(weatherAt(at(5, 2, 3)).isNight).toBe(true);
    expect(weatherAt(at(5, 2, 12)).isNight).toBe(false);
    expect(weatherAt(at(5, 2, 21)).isNight).toBe(true);
  });
});

describe('forecast', () => {
  it('gives 7 days with weekday names in order', () => {
    const days = forecast(10);
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.dayNumber)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(days[0]?.weekday).toBe(3);
    expect(days[4]?.weekday).toBe(0);
  });

  it('equals what happens later: temperatures and conditions', () => {
    const first = 100;
    const predicted = forecast(first, 7);
    for (const day of predicted) {
      const start = day.dayNumber * STEPS_PER_DAY;
      let low = Infinity;
      let high = -Infinity;
      let rainyBlocks = 0;
      for (let step = start; step < start + STEPS_PER_DAY; step += 1) {
        const value = temperatureAt(step);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      for (let block = 0; block < BLOCKS_PER_DAY; block += 1) {
        if (conditionAt(start + block * STEPS_PER_BLOCK) === 'rain') rainyBlocks += 1;
      }
      expect(day.minTemperature).toBeCloseTo(low, 9);
      expect(day.maxTemperature).toBeCloseTo(high, 9);
      expect(day.rainChance).toBe(rainyBlocks / BLOCKS_PER_DAY);
      if (rainyBlocks >= 2) expect(day.condition).toBe('rain');
    }
  });

  it('does not depend on when it is asked', () => {
    expect(forecastDay(55)).toEqual(forecast(50, 10)[5]);
  });
});
