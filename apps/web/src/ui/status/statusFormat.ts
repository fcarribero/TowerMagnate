import { dateOfStep, STEPS_PER_MINUTE } from '@tower-magnate/engine/calendar';
import type { StarRating } from '@tower-magnate/shared';
import { t, type StringKey } from '../strings';

export interface StatusDate {
  text: string;
  isWeekend: boolean;
}

export const STAR_SLOTS = 5;
const TOWER_RANK: StarRating = 6;

/** Whole game minutes since step 0; the status bar only redraws when this changes. */
export function gameMinuteOfStep(step: number): number {
  return Math.floor(step / STEPS_PER_MINUTE);
}

export function stepOfGameMinute(minute: number): number {
  return minute * STEPS_PER_MINUTE;
}

export function formatGameDate(step: number): StatusDate {
  const date = dateOfStep(step);
  const text = t('ui.date', {
    weekday: t(`calendar.weekday.${date.weekday}` as StringKey),
    day: date.day,
    month: t(`calendar.month.${date.month}` as StringKey),
    year: date.year,
  });
  return { text, isWeekend: date.isWeekend };
}

export function formatGameTime(step: number): string {
  const { hour, minute } = dateOfStep(step);
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}

export function formatPopulation(population: number): string {
  return t('ui.population', { n: formatCount(population) });
}

/** `.` between thousands, as in money. */
export function formatCount(count: number): string {
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function filledStars(stars: StarRating): number {
  return Math.min(stars, STAR_SLOTS);
}

export function isTowerRank(stars: StarRating): boolean {
  return stars === TOWER_RANK;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}
