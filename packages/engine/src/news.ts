import type { NewsFields, NewsId, TowerState } from '@tower-magnate/shared';
import { isNewsAllowed, rememberNews, type NewsTarget } from './news-limit';

export type NewsEvent = { type: 'news'; step: number } & NewsFields;

/**
 * The one way a notice leaves the engine (messages.md 2 and 4). Returns the news event to report,
 * or nothing when the rate limit drops it; a dropped notice changes no state.
 */
export function emitNews(state: TowerState, key: NewsId, target: NewsTarget = {}): NewsEvent[] {
  if (!isNewsAllowed(state.newsSent, key, target, state.step)) return [];
  state.newsSent = rememberNews(state.newsSent, key, target, state.step);
  return [
    {
      type: 'news',
      step: state.step,
      key,
      unitId: target.unitId ?? null,
      params: { ...target.params },
    },
  ];
}

/**
 * The balance notice for a change that took the balance from `balanceBefore` below zero.
 * A charge with its own notice, such as the weekly upkeep, is passed as `ignoredCharge`.
 */
export function balanceNegativeNews(
  state: TowerState,
  balanceBefore: number,
  ignoredCharge = 0,
): NewsEvent[] {
  if (balanceBefore < 0 || state.money + ignoredCharge >= 0) return [];
  return emitNews(state, 'news.balanceNegative');
}
