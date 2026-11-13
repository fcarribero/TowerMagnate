import { dateOfStep } from '@tower-magnate/engine/calendar';
import {
  forecast,
  weatherAt,
  type Season,
  type WeatherCondition,
} from '@tower-magnate/engine/weather';
import type { ObraIconName } from '../icons/ObraIcon';
import type { StringKey } from '../strings';

export interface CurrentWeather {
  condition: WeatherCondition;
  isNight: boolean;
  /** Whole degrees Celsius. */
  temperature: number;
  season: Season;
}

export interface ForecastRow {
  dayNumber: number;
  weekdayKey: StringKey;
  condition: WeatherCondition;
  min: number;
  max: number;
  /** Whole percent. */
  rainPercent: number;
}

export const FORECAST_DAYS = 7;

/** Rounds to whole degrees and never gives -0. */
export function wholeDegrees(value: number): number {
  return Math.round(value) + 0;
}

export function formatTemperature(degrees: number): string {
  return `${wholeDegrees(degrees)}°`;
}

export function currentWeather(step: number): CurrentWeather {
  const reading = weatherAt(step);
  return {
    condition: reading.condition,
    isNight: reading.isNight,
    temperature: wholeDegrees(reading.temperature),
    season: reading.season,
  };
}

export function weatherIcon(condition: WeatherCondition, isNight = false): ObraIconName {
  if (condition === 'rain') return 'weatherRain';
  if (condition === 'cloudy') return 'weatherCloud';
  return isNight ? 'weatherMoon' : 'weatherSun';
}

/** Name of a condition; a sunny night is a clear one. */
export function conditionLabel(condition: WeatherCondition, isNight = false): StringKey {
  if (condition === 'sunny' && isNight) return 'window.weather.condition.clear';
  return `window.weather.condition.${condition}`;
}

export function seasonLabel(season: Season): StringKey {
  return `window.weather.season.${season}`;
}

/** The next 7 days, starting tomorrow. */
export function forecastRows(step: number): ForecastRow[] {
  const tomorrow = dateOfStep(step).dayNumber + 1;
  return forecast(tomorrow, FORECAST_DAYS).map((day) => ({
    dayNumber: day.dayNumber,
    weekdayKey: `calendar.weekday.${day.weekday}` as StringKey,
    condition: day.condition,
    min: wholeDegrees(day.minTemperature),
    max: wholeDegrees(day.maxTemperature),
    rainPercent: Math.round(day.rainChance * 100),
  }));
}
