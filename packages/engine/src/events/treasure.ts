import {
  FIRST_COLUMN,
  LAST_COLUMN,
  LOWEST_BUILDABLE_LEVEL,
  type GridState,
  type Level,
  type TowerState,
} from '@tower-magnate/shared';
import { hasStructure } from '../commands/structure';
import { creditMoney } from '../money';
import { chance } from '../rng';
import type { CommandEvent } from '../step';
import { emitNews } from '../news';

const TREASURE_CHANCE = 1 / 40;

function treasureAmount(level: Level): number {
  if (level >= -3) return 50_000;
  if (level >= -6) return 100_000;
  return 200_000;
}

function hasNewCell(before: GridState, after: GridState, level: Level): boolean {
  for (let x = FIRST_COLUMN; x <= LAST_COLUMN; x++) {
    if (hasStructure(after, level, x) && !hasStructure(before, level, x)) {
      return true;
    }
  }
  return false;
}

/** Basement levels that got a new cell, deepest first. */
function dugLevels(before: GridState, after: GridState): Level[] {
  const levels: Level[] = [];
  for (let level = LOWEST_BUILDABLE_LEVEL; level < 0; level++) {
    if (hasNewCell(before, after, level)) {
      levels.push(level);
    }
  }
  return levels;
}

/**
 * Rolls once for the deepest dug level that has not given treasure yet. Call it after the
 * command was charged, with the grid as it was before the command.
 */
export function rollBasementTreasure(state: TowerState, gridBefore: GridState): CommandEvent[] {
  const level = dugLevels(gridBefore, state.grid).find(
    (candidate) => !state.treasureLevels.includes(candidate),
  );
  if (level === undefined || !chance(state.rng, TREASURE_CHANCE)) {
    return [];
  }
  const amount = creditMoney(state, 'events', treasureAmount(level));
  state.treasureLevels.push(level);
  return [
    { type: 'treasureFound', level, amount },
    ...emitNews(state, 'news.treasure', { params: { level, amount } }),
  ];
}
