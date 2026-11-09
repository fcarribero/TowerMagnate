import {
  DAYS_PER_WEEK,
  openRandomBombThreat,
  openRandomFire,
  openVipVisitNow,
  rollLedgerWeek,
  STEPS_PER_DAY,
  STEPS_PER_MINUTE,
  STEPS_PER_WEEK,
  weekdayOfDay,
  type StepContext,
} from '@tower-magnate/engine';
import { verticalSliceTower } from '@tower-magnate/engine/testing';
import type { ErrorCode, TowerState } from '@tower-magnate/shared';
import type { TowerChange } from '../runner';
import type { DebugEventKind, DebugScenario } from './messages';

/** Why a debug change was refused: an engine error code, or an event the engine does not have yet. */
export class DebugRefusal extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DebugRefusal';
  }
}

export function forceEvent(kind: DebugEventKind): TowerChange {
  if (kind === 'vip') return forceVipVisit;
  return (state) => {
    const context: StepContext = { state: structuredClone(state), events: [] };
    const opened =
      kind === 'bomb'
        ? openRandomBombThreat(context)
        : kind === 'fire'
          ? openRandomFire(context)
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

/**
 * Starts a VIP visit without the daily roll or the star check. The VIP books a suite at the next
 * 12:00. Only one visit runs at a time.
 */
const forceVipVisit: TowerChange = (state) => {
  const forced = structuredClone(state);
  if (openVipVisitNow(forced) === null) throw new DebugRefusal('LIMIT_REACHED');
  return { state: forced, events: [] };
};

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

const SCENARIO_TOWERS: Readonly<Record<DebugScenario, () => TowerState>> = {
  verticalSlice: verticalSliceTower,
};

/** Replaces the tower with a fresh copy of a test scenario's starting tower. */
export function loadScenario(name: DebugScenario): TowerChange {
  return () => ({ state: SCENARIO_TOWERS[name](), events: [] });
}
