import {
  announceSanta,
  DAYS_PER_WEEK,
  infestDirtyRoomNow,
  isRoom,
  NOTHING_DUE,
  openRandomBombThreat,
  openRandomFire,
  openVipVisitNow,
  recordNotices,
  rollLedgerWeek,
  startWeddingNow,
  stepOfDate,
  STEPS_PER_DAY,
  STEPS_PER_MINUTE,
  STEPS_PER_WEEK,
  weekdayOfDay,
  type StepContext,
} from '@tower-magnate/engine';
import { eventShowcaseTower, verticalSliceTower } from '@tower-magnate/engine/testing';
import type { ErrorCode, TowerState, UnitId } from '@tower-magnate/shared';
import type { TowerChange } from '../runner';
import { MAX_CLOCK_JUMP_DAYS, type DebugEventKind, type DebugScenario } from './messages';

/** Why a debug change was refused: an engine error code, or an event the engine does not have yet. */
export class DebugRefusal extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DebugRefusal';
  }
}

export function forceEvent(kind: DebugEventKind, unitId?: string): TowerChange {
  if (kind === 'vip') return forceVipVisit;
  if (kind === 'santa') return forceSanta;
  if (kind === 'wedding') return forceWedding;
  if (kind === 'infestation') return forceInfestation(unitId);
  return (state) => {
    const context: StepContext = { state: structuredClone(state), events: [] };
    const opened = kind === 'bomb' ? openRandomBombThreat(context) : openRandomFire(context);
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

/** Starts today's wedding attempt on the built cathedral, without the weekend, star or population checks. */
const forceWedding: TowerChange = (state) => {
  if (state.wedding) throw new DebugRefusal('LIMIT_REACHED');
  const forced = structuredClone(state);
  if (startWeddingNow(forced) === null) throw new DebugRefusal('UNKNOWN_ENTITY');
  return { state: forced, events: [] };
};

/** Infests the given dirty hotel room, or the first dirty one, now, without waiting for the third dirty check. */
function forceInfestation(unitId: string | undefined): TowerChange {
  return (state) => {
    const room =
      unitId === undefined
        ? Object.values(state.units).find((unit) => isRoom(unit) && unit.hotel.state === 'dirty')
        : state.units[unitId as UnitId];
    if (!room) throw new DebugRefusal('UNKNOWN_ENTITY');
    if (!isRoom(room) || room.hotel.state !== 'dirty') throw new DebugRefusal('INVALID_COMMAND');
    const context: StepContext = { state: structuredClone(state), events: [] };
    infestDirtyRoomNow(context, context.state.units[room.id] as typeof room);
    return { state: context.state, events: context.events };
  };
}

/** Santa is only a notice: it is kept with the other notices and nothing else changes. */
const forceSanta: TowerChange = (state) => {
  const context: StepContext = { state: structuredClone(state), events: [] };
  announceSanta(context);
  recordNotices(context.state, context.events);
  return { state: context.state, events: context.events };
};

/** Runs the steps through the same advance the real clock uses, so the result matches. */
export function fastForward(steps: number): TowerChange {
  return (state, advance) => advance(state, steps);
}

/** A weekday (0 is Monday) and a time, or a game calendar date and a time. */
export interface ClockTarget {
  day: number;
  time: string;
  year?: number | undefined;
  month?: number | undefined;
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

/** The next time the clock shows `time` on weekday `day`, at most a week ahead. */
function nextWeekdayStep(fromStep: number, day: number, time: string): number {
  const dayNumber = Math.floor(fromStep / STEPS_PER_DAY);
  const daysAhead = (day - weekdayOfDay(dayNumber) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const target = (dayNumber + daysAhead) * STEPS_PER_DAY + minutesOf(time) * STEPS_PER_MINUTE;
  return target <= fromStep ? target + DAYS_PER_WEEK * STEPS_PER_DAY : target;
}

/** The step of a calendar date and time, refused when the date does not exist, is past or too far ahead. */
function calendarStep(fromStep: number, year: number, month: number, day: number, time: string) {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  let target: number;
  try {
    target = stepOfDate({ year, month, day, hour, minute });
  } catch {
    throw new DebugRefusal('INVALID_COMMAND');
  }
  const daysAhead = (target - fromStep) / STEPS_PER_DAY;
  if (target <= fromStep || daysAhead > MAX_CLOCK_JUMP_DAYS) {
    throw new DebugRefusal('INVALID_COMMAND');
  }
  return target;
}

/** Jumps the clock forward and applies the Mondays it crosses. */
export function setClock(clock: ClockTarget): TowerChange {
  return (state) => {
    const { year, month, day, time } = clock;
    const target =
      year === undefined || month === undefined
        ? nextWeekdayStep(state.step, day, time)
        : calendarStep(state.step, year, month, day, time);
    const jumped = { ...structuredClone(state), step: target };
    wakeOverduePeople(jumped);
    const mondaysCrossed =
      Math.floor(target / STEPS_PER_WEEK) - Math.floor(state.step / STEPS_PER_WEEK);
    for (let monday = 0; monday < mondaysCrossed; monday++) {
      rollLedgerWeek(jumped);
    }
    return { state: jumped, events: [] };
  };
}

/**
 * The people system only wakes a person on the exact step they are due, so anyone due inside
 * the jump would stand still for good. They act on the first step after it instead.
 */
function wakeOverduePeople(state: TowerState): void {
  const { dueStep } = state.people;
  for (let slot = 0; slot < dueStep.length; slot++) {
    const due = dueStep[slot] as number;
    if (due !== NOTHING_DUE && due <= state.step) dueStep[slot] = state.step + 1;
  }
}

export function setMoney(amount: number): TowerChange {
  return (state) => ({ state: { ...structuredClone(state), money: amount }, events: [] });
}

const SCENARIO_TOWERS: Readonly<Record<DebugScenario, () => TowerState>> = {
  verticalSlice: verticalSliceTower,
  eventShowcase: eventShowcaseTower,
};

/** Replaces the tower with a fresh copy of a test scenario's starting tower. */
export function loadScenario(name: DebugScenario): TowerChange {
  return () => ({ state: SCENARIO_TOWERS[name](), events: [] });
}
