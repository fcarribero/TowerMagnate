import { dateOfStep, daysInMonth, weekdayOfDay, type Weekday } from './calendar';
import { STEPS_PER_DAY } from './clock';

/*
 * Weather is a pure function of (seed, step). It stores nothing and draws nothing from the
 * simulation RNG, so the server, the client and the 7-day forecast all read the same values.
 * See docs/design/weather.md.
 */

export type WeatherCondition = 'sunny' | 'cloudy' | 'rain';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Fixed salt: every tower has the same weather. A tower seed can be passed instead. */
export const WEATHER_SALT = 0x7e47_4e12;

/** The day is cut into blocks; a block has one condition, so rain lasts at least 6 hours. */
export const BLOCKS_PER_DAY = 4;
export const STEPS_PER_BLOCK = STEPS_PER_DAY / BLOCKS_PER_DAY;

/** Hour of the coldest and of the warmest point of a day. */
export const COLDEST_HOUR = 5;
export const WARMEST_HOUR = 15;

const DAYTIME_FIRST_HOUR = 6;
const DAYTIME_END_HOUR = 20;

/** Seasonal daily mean: a cosine through the year, warmest on day 200 (mid July). */
const YEAR_MEAN_C = 15;
const YEAR_SWING_C = 9;
const WARMEST_DAY_OF_YEAR = 200;
/** Half of the usual gap between the night low and the afternoon high. */
const DAILY_HALF_RANGE_C = 5.5;
const DAY_OFFSET_SPAN_C = 5;

/** Added to the afternoon high, and to the dawn low, by the condition at that time. */
const HIGH_ADJUST_C: Record<WeatherCondition, number> = { sunny: 2, cloudy: -1, rain: -3.5 };
const LOW_ADJUST_C: Record<WeatherCondition, number> = { sunny: -1.5, cloudy: 1, rain: 0 };

/** A block of cloudiness above these is cloudy, and above the second is rain. */
const THRESHOLDS: Record<Season, { cloudy: number; rain: number }> = {
  winter: { cloudy: 0.44, rain: 0.66 },
  spring: { cloudy: 0.46, rain: 0.65 },
  summer: { cloudy: 0.52, rain: 0.73 },
  autumn: { cloudy: 0.44, rain: 0.64 },
};

export interface WeatherReading {
  condition: WeatherCondition;
  /** In degrees Celsius, not rounded. */
  temperature: number;
  season: Season;
  /** Before sunrise or after sunset; a sunny night is a clear night. */
  isNight: boolean;
}

export interface ForecastDay {
  dayNumber: number;
  weekday: Weekday;
  season: Season;
  /** What most of the day is: rain when at least 2 of its 4 blocks are rainy. */
  condition: WeatherCondition;
  minTemperature: number;
  maxTemperature: number;
  /** Share of the day's blocks that are rainy: 0, 0.25, 0.5, 0.75 or 1. */
  rainChance: number;
}

/** Northern hemisphere, by calendar month: spring starts in March, summer in June, and so on. */
export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function seasonOfStep(step: number): Season {
  return seasonOfMonth(dateOfStep(step).month);
}

export function isNightHour(hour: number): boolean {
  return hour < DAYTIME_FIRST_HOUR || hour >= DAYTIME_END_HOUR;
}

/** An integer hash of three numbers, mapped to [0, 1). */
function unitHash(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4_294_967_296;
}

/** Cloudiness of a block, 0 to 1. Averaging with the neighbors makes weather last across blocks. */
function cloudiness(seed: number, block: number): number {
  const before = unitHash(seed, block - 1, 1);
  const here = unitHash(seed, block, 1);
  const after = unitHash(seed, block + 1, 1);
  return (before + 2 * here + after) / 4;
}

function blockOfStep(step: number): number {
  return Math.floor(step / STEPS_PER_BLOCK);
}

function seasonOfDay(dayNumber: number): Season {
  return seasonOfStep(dayNumber * STEPS_PER_DAY);
}

function conditionOfBlock(block: number, seed: number): WeatherCondition {
  const season = seasonOfDay(Math.floor(block / BLOCKS_PER_DAY));
  const limits = THRESHOLDS[season];
  const value = cloudiness(seed, block);
  if (value >= limits.rain) return 'rain';
  return value >= limits.cloudy ? 'cloudy' : 'sunny';
}

export function conditionAt(step: number, seed: number = WEATHER_SALT): WeatherCondition {
  return conditionOfBlock(blockOfStep(step), seed);
}

function dayOfYear(dayNumber: number): number {
  const { year, month, day } = dateOfStep(dayNumber * STEPS_PER_DAY);
  let days = day;
  for (let before = 1; before < month; before += 1) {
    days += daysInMonth(year, before);
  }
  return days;
}

/** The daily mean for a day, from the season curve and a per-day offset. */
function dayMean(dayNumber: number, seed: number): number {
  const phase = (2 * Math.PI * (dayOfYear(dayNumber) - WARMEST_DAY_OF_YEAR)) / 365;
  const offset = (unitHash(seed, dayNumber, 2) - 0.5) * DAY_OFFSET_SPAN_C;
  return YEAR_MEAN_C + YEAR_SWING_C * Math.cos(phase) + offset;
}

/** The afternoon high of a day. */
function dayHigh(dayNumber: number, seed: number): number {
  const block = dayNumber * BLOCKS_PER_DAY + Math.floor(WARMEST_HOUR / 6);
  return dayMean(dayNumber, seed) + DAILY_HALF_RANGE_C + HIGH_ADJUST_C[conditionOfBlock(block, seed)];
}

/** The low just before dawn of a day. */
function dayLow(dayNumber: number, seed: number): number {
  const block = dayNumber * BLOCKS_PER_DAY + Math.floor(COLDEST_HOUR / 6);
  return dayMean(dayNumber, seed) - DAILY_HALF_RANGE_C + LOW_ADJUST_C[conditionOfBlock(block, seed)];
}

/**
 * Temperature in Celsius. It falls from each afternoon high to the next dawn low and rises back,
 * on half cosines, so it is smooth and flat at both turning points.
 */
export function temperatureAt(step: number, seed: number = WEATHER_SALT): number {
  const day = Math.floor(step / STEPS_PER_DAY);
  const hour = ((step % STEPS_PER_DAY) / STEPS_PER_DAY) * 24;
  if (hour < COLDEST_HOUR) {
    const fall = (hour + 24 - WARMEST_HOUR) / (24 + COLDEST_HOUR - WARMEST_HOUR);
    return blend(dayHigh(Math.max(day - 1, 0), seed), dayLow(day, seed), fall);
  }
  if (hour < WARMEST_HOUR) {
    const rise = (hour - COLDEST_HOUR) / (WARMEST_HOUR - COLDEST_HOUR);
    return blend(dayLow(day, seed), dayHigh(day, seed), rise);
  }
  const fall = (hour - WARMEST_HOUR) / (24 + COLDEST_HOUR - WARMEST_HOUR);
  return blend(dayHigh(day, seed), dayLow(day + 1, seed), fall);
}

/** Eases from `from` to `to` along half a cosine, flat at both ends. */
function blend(from: number, to: number, share: number): number {
  return from + (to - from) * ((1 - Math.cos(Math.PI * share)) / 2);
}

export function weatherAt(step: number, seed: number = WEATHER_SALT): WeatherReading {
  const date = dateOfStep(step);
  return {
    condition: conditionAt(step, seed),
    temperature: temperatureAt(step, seed),
    season: seasonOfMonth(date.month),
    isNight: isNightHour(date.hour),
  };
}

/** What a whole day turns out to be. Reads the same functions the game reads as time passes. */
export function forecastDay(dayNumber: number, seed: number = WEATHER_SALT): ForecastDay {
  const first = dayNumber * STEPS_PER_DAY;
  const counts: Record<WeatherCondition, number> = { sunny: 0, cloudy: 0, rain: 0 };
  for (let block = 0; block < BLOCKS_PER_DAY; block += 1) {
    counts[conditionAt(first + block * STEPS_PER_BLOCK, seed)] += 1;
  }
  const half = BLOCKS_PER_DAY / 2;
  let condition: WeatherCondition = 'sunny';
  if (counts.rain >= half) condition = 'rain';
  else if (counts.rain + counts.cloudy >= half) condition = 'cloudy';
  const edges = [temperatureAt(first, seed), temperatureAt(first + STEPS_PER_DAY - 1, seed)];
  return {
    dayNumber,
    weekday: weekdayOfDay(dayNumber),
    season: seasonOfDay(dayNumber),
    condition,
    minTemperature: Math.min(dayLow(dayNumber, seed), ...edges),
    maxTemperature: Math.max(dayHigh(dayNumber, seed), ...edges),
    rainChance: counts.rain / BLOCKS_PER_DAY,
  };
}

/** `count` days starting at `firstDay`. */
export function forecast(
  firstDay: number,
  count = 7,
  seed: number = WEATHER_SALT,
): ForecastDay[] {
  return Array.from({ length: count }, (_, index) => forecastDay(firstDay + index, seed));
}
