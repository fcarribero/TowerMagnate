import { NEWS_RULES, type NewsId } from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';

/** The step each key and scope value was last emitted at, keyed by `newsSlot`. */
export type NewsMemory = Record<string, number>;

/** What a notice is about, for the scope of its key (messages.md 4). */
export interface NewsTarget {
  unitId?: string | null;
  level?: number;
  eventId?: string;
}

/** The scope value of a notice: one string per tower, unit, level or event. */
export function newsScopeValue(key: NewsId, target: NewsTarget): string {
  switch (NEWS_RULES[key].scope) {
    case 'tower':
      return 'tower';
    case 'unit':
      return `unit:${target.unitId ?? ''}`;
    case 'level':
      return `level:${target.level ?? ''}`;
    case 'event':
      return `event:${target.eventId ?? ''}`;
  }
}

export function newsSlot(key: NewsId, target: NewsTarget): string {
  return `${key}|${newsScopeValue(key, target)}`;
}

function dayOf(step: number): number {
  return Math.floor(step / STEPS_PER_DAY);
}

/** False when the same key and scope value went out less than the gap ago, or today for daily keys. */
export function isNewsAllowed(
  memory: NewsMemory,
  key: NewsId,
  target: NewsTarget,
  step: number,
): boolean {
  const last = memory[newsSlot(key, target)];
  if (last === undefined) return true;
  const rule = NEWS_RULES[key];
  if (step - last < rule.minGapMinutes * STEPS_PER_MINUTE) return false;
  return !rule.oncePerDay || dayOf(last) !== dayOf(step);
}

export function rememberNews(
  memory: NewsMemory,
  key: NewsId,
  target: NewsTarget,
  step: number,
): void {
  memory[newsSlot(key, target)] = step;
}
