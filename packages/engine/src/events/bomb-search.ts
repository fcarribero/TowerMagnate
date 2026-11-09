import {
  levelToIndex,
  LOWEST_BUILDABLE_LEVEL,
  SEARCH_COLUMNS_PER_MINUTE,
  SEARCH_STEPS_PER_MINUTE,
  TOP_FLOOR_LEVEL,
  type BombSearch,
  type BombThreat,
  type GridState,
  type Level,
  type TowerState,
} from '@tower-magnate/shared';
import { slotOfPerson } from '../people';
import type { StepContext } from '../step';
import { isOnTrek } from '../trek';
import { endDisaster } from './decisions';
import {
  forget,
  guardSlots,
  isStandingOn,
  sendGuard,
  sendGuardHome,
  structureOfLevel,
} from './guards';
import { emitNews } from '../news';

function holdsUnitOtherThanLobby(state: TowerState, level: Level): boolean {
  const occupants = state.grid.levels[level]?.occupants ?? [];
  return occupants.some(
    (span) => span.occupant.kind === 'unit' && state.units[span.occupant.id]?.type !== 'lobby',
  );
}

function searchableLevels(state: TowerState, bombLevel: Level): Level[] {
  const levels: Level[] = [];
  for (let level = LOWEST_BUILDABLE_LEVEL; level <= TOP_FLOOR_LEVEL; level++) {
    if (level === 0) continue;
    if (level === bombLevel || holdsUnitOtherThanLobby(state, level)) levels.push(level);
  }
  return levels;
}

/** One game minute for every 4 columns with structure, at least one minute. */
export function searchSteps(grid: GridState, level: Level): number {
  const { columns } = structureOfLevel(grid, level);
  return SEARCH_STEPS_PER_MINUTE * Math.max(1, Math.ceil(columns / SEARCH_COLUMNS_PER_MINUTE));
}

function nearestUnsearched(search: BombSearch, person: number, from: Level): Level | null {
  const skipped = search.unreachable[person] ?? [];
  const origin = levelToIndex(from);
  let best: Level | null = null;
  let bestDistance = Infinity;
  for (const [key, state] of Object.entries(search.levels)) {
    const level = Number(key);
    if (state !== 'unsearched' || skipped.includes(level)) continue;
    const distance = Math.abs(levelToIndex(level) - origin);
    const higherOnTie = best !== null && level > best;
    if (distance < bestDistance || (distance === bestDistance && higherOnTie)) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

function beginSearching(context: StepContext, search: BombSearch, person: number, level: Level) {
  const endStep = context.state.step + searchSteps(context.state.grid, level);
  search.guards[person] = { level, endStep };
}

function releaseLevel(search: BombSearch, person: number, level: Level, unreachable: boolean) {
  search.levels[level] = 'unsearched';
  forget(search.guards, person);
  if (unreachable) (search.unreachable[person] ??= []).push(level);
}

/**
 * The guard takes the nearest free level and goes there. A level it cannot reach is released and
 * remembered, and it picks again in the same step. With nothing left it returns to the office.
 */
function pickLevel(context: StepContext, search: BombSearch, slot: number): void {
  const { state } = context;
  const person = state.people.id[slot] as number;
  for (;;) {
    const level = nearestUnsearched(search, person, state.people.level[slot] as Level);
    if (level === null) {
      forget(search.guards, person);
      sendGuardHome(context, slot);
      return;
    }
    search.levels[level] = 'taken';
    if (state.people.level[slot] === level) {
      beginSearching(context, search, person, level);
      return;
    }
    const { leftmost } = structureOfLevel(state.grid, level);
    if (leftmost !== null && sendGuard(context, slot, { level, column: leftmost })) {
      search.guards[person] = { level, endStep: null };
      return;
    }
    releaseLevel(search, person, level, true);
  }
}

/** Starts the search after the player refuses or the decision times out (events 4.4). */
export function startBombSearch(context: StepContext, bomb: BombThreat, bombLevel: Level): void {
  const levels: BombSearch['levels'] = {};
  for (const level of searchableLevels(context.state, bombLevel)) levels[level] = 'unsearched';
  const search: BombSearch = { bombLevel, levels, guards: {}, unreachable: {} };
  bomb.search = search;
  for (const slot of guardSlots(context.state.people)) pickLevel(context, search, slot);
}

function guardNumbers(search: BombSearch): number[] {
  return Object.keys(search.guards)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Starts the search of guards that have arrived; a guard whose trip failed picks again. */
function settleArrivals(context: StepContext, search: BombSearch): void {
  const pool = context.state.people;
  for (const person of guardNumbers(search)) {
    const guard = search.guards[person];
    if (!guard || guard.endStep !== null) continue;
    const slot = slotOfPerson(pool, person);
    if (slot < 0) {
      releaseLevel(search, person, guard.level, false);
    } else if (isStandingOn(pool, slot, guard.level)) {
      beginSearching(context, search, person, guard.level);
    } else if (!isOnTrek(pool, slot)) {
      releaseLevel(search, person, guard.level, true);
      pickLevel(context, search, slot);
    }
  }
}

/** Events phase item 8: levels whose search ends at this step, guards in increasing id. */
export function runBombSearch(context: StepContext, bomb: BombThreat): void {
  const { search } = bomb;
  if (!search) return;
  settleArrivals(context, search);
  for (const person of guardNumbers(search)) {
    const guard = search.guards[person];
    if (guard?.endStep !== context.state.step) continue;
    search.levels[guard.level] = 'searched';
    forget(search.guards, person);
    if (guard.level === search.bombLevel) {
      context.events.push(...emitNews(context.state, 'news.bombFound', { eventId: bomb.id }));
      endDisaster(context, bomb.id);
      return;
    }
    const slot = slotOfPerson(context.state.people, person);
    if (slot >= 0) pickLevel(context, search, slot);
  }
}
