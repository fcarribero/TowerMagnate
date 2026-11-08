import {
  DAYS_PER_WEEK,
  openFire,
  openRandomBombThreat,
  rollLedgerWeek,
  STEPS_PER_DAY,
  STEPS_PER_MINUTE,
  STEPS_PER_WEEK,
  weekdayOfDay,
  type StepContext,
} from '@tower-magnate/engine';
import type { ErrorCode, TowerState } from '@tower-magnate/shared';
import type { TowerChange } from '../runner';
import type { DebugEventKind } from './messages';

/** Why a debug change was refused: an engine error code, or an event the engine does not have yet. */
export class DebugRefusal extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DebugRefusal';
  }
}

function highestBuiltLevel(state: TowerState): number {
  const built = Object.keys(state.grid.levels).map(Number);
  return Math.max(1, ...built);
}

export function forceEvent(kind: DebugEventKind): TowerChange {
  return (state) => {
    const context: StepContext = { state: structuredClone(state), events: [] };
    const opened =
      kind === 'bomb'
        ? openRandomBombThreat(context)
        : kind === 'fire'
          ? openFire(context, highestBuiltLevel(context.state))
          : undefined;
    if (opened === undefined) {
      throw new DebugRefusal('INVALID_COMMAND');
    }
    if (opened === null) {
      throw new DebugRefusal(
        context.state.activeEvents.length > 0 ? 'BOMB_EVENT_ACTIVE' : 'UNKNOWN_ENTITY',
      );
    }
    return { state: context.state, events: context.events };
  };
}

/** Runs the steps through the same advance the real clock uses, so the result matches. */
export function fastForward(steps: number): TowerChange {
  return (state, advance) => advance(state, steps);
}

/** Jumps to the next time the clock shows `time` on weekday `day` (0 is Monday), at most a week ahead. */
export function setClock(day: number, time: string): TowerChange {
  return (state) => {
    const [hour, minute] = time.split(':').map(Number) as [number, number];
    const dayNumber = Math.floor(state.step / STEPS_PER_DAY);
    const daysAhead = (day - weekdayOfDay(dayNumber) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    const timeOfDay = (hour * 60 + minute) * STEPS_PER_MINUTE;
    let target = (dayNumber + daysAhead) * STEPS_PER_DAY + timeOfDay;
    if (target <= state.step) {
      target += DAYS_PER_WEEK * STEPS_PER_DAY;
    }
    const jumped = { ...structuredClone(state), step: target };
    const mondaysCrossed =
      Math.floor(target / STEPS_PER_WEEK) - Math.floor(state.step / STEPS_PER_WEEK);
    for (let monday = 0; monday < mondaysCrossed; monday++) {
      rollLedgerWeek(jumped);
    }
    return { state: jumped, events: [] };
  };
}

export function setMoney(amount: number): TowerChange {
  return (state) => ({ state: { ...structuredClone(state), money: amount }, events: [] });
}
