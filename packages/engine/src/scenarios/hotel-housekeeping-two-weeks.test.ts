import type {
  EngineEvent,
  Level,
  QueuedCommand,
  TowerState,
  UnitId,
  UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { openVipVisit } from '../events/vip';
import { maidTaskAt } from '../housekeeping';
import { populationOf } from '../population';
import { deserializeState, serializeState } from '../serialization';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';

const DAYS = 14;
const VIP_DAYS: ReadonlySet<number> = new Set([3, 7, 11]);
const CHECK_DAY = 3;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

function dayOf(stepNumber: number): number {
  return Math.floor(stepNumber / STEPS_PER_DAY);
}

/** TM-139 playtest layout: 10 rooms with 2 suites on levels 2 and 3, one housekeeping unit. */
const ROOMS: readonly { type: UnitType; level: Level; x: number }[] = [
  { type: 'single-room', level: 2, x: 40 },
  { type: 'single-room', level: 2, x: 44 },
  { type: 'double-room', level: 2, x: 50 },
  { type: 'double-room', level: 2, x: 56 },
  { type: 'suite', level: 2, x: 70 },
  { type: 'single-room', level: 3, x: 20 },
  { type: 'single-room', level: 3, x: 24 },
  { type: 'double-room', level: 3, x: 30 },
  { type: 'double-room', level: 3, x: 36 },
  { type: 'suite', level: 3, x: 50 },
];

function threeStarHotel(): TowerState {
  const { state } = buildTower({
    seed: 7,
    ...plainTowerPlan(3, 0, 119),
    units: [{ type: 'housekeeping', level: 2, x: 20 }, ...ROOMS],
    flights: [
      { type: 'stairs', x: 0, level: 1 },
      { type: 'stairs', x: 10, level: 2 },
    ],
  });
  state.stars = 3;
  state.money = 50_000_000;
  return state;
}

function suitesOf(state: TowerState): UnitId[] {
  return Object.values(state.units)
    .filter((unit) => unit.type === 'suite')
    .map((unit) => unit.id);
}

function isFreeSuite(state: TowerState, id: UnitId): boolean {
  const hotel = state.units[id]?.hotel;
  return hotel?.stayEndStep === null && hotel.arrivalStep === null;
}

function maidsCleaning(state: TowerState): number {
  let count = 0;
  for (let slot = 0; slot < state.people.id.length; slot++) {
    if (maidTaskAt(state.people, slot)?.phase === 'cleaning') count += 1;
  }
  return count;
}

/** The player pays every ransom and calls every helicopter, so no event destroys the hotel. */
function answersToOpenDecisions(state: TowerState): QueuedCommand[] {
  return state.activeEvents
    .filter((event) => 'decision' in event && event.decision.choice === null)
    .map((event, index) => ({
      id: `answer-${state.step}-${index}`,
      command: {
        type: 'answerEvent',
        eventId: event.id,
        choice: (event as { decision: { options: string[] } }).decision.options[0] as string,
      },
    }));
}

interface PlayLog {
  events: EngineEvent[];
  hotelPopulationAt23: number[];
  /** Days whose 12:00 VIP booking found at least one suite with no stay and no booking. */
  freeSuiteAtNoon: Set<number>;
  unitsAtEnd: number;
}

/** Stops on every hour, just before 12:00 and at the given extra steps. */
function nextStop(current: number, extraStops: readonly number[]): number {
  const nextHour = (Math.floor(current / STEPS_PER_HOUR) + 1) * STEPS_PER_HOUR;
  const beforeNoon = at(dayOf(current), 12) - 1;
  const candidates = [nextHour, ...extraStops];
  if (beforeNoon > current) candidates.push(beforeNoon);
  return Math.min(...candidates.filter((stop) => stop > current));
}

function play(start: TowerState, end: number, extraStops: readonly number[] = []) {
  let state = start;
  const log: PlayLog = {
    events: [],
    hotelPopulationAt23: [],
    freeSuiteAtNoon: new Set(),
    unitsAtEnd: 0,
  };
  while (state.step < end) {
    const day = dayOf(state.step);
    if (VIP_DAYS.has(day) && state.step === at(day, 0)) openVipVisit(state, day);
    if (state.step === at(day, 12) - 1 && suitesOf(state).some((id) => isFreeSuite(state, id))) {
      log.freeSuiteAtNoon.add(day);
    }
    if (state.step === at(day, 23)) log.hotelPopulationAt23.push(populationOf(state).hotel);
    const stop = Math.min(nextStop(state.step, extraStops), end);
    const run = step(state, answersToOpenDecisions(state), stop - state.step);
    log.events.push(...run.events);
    state = run.state;
  }
  log.unitsAtEnd = Object.keys(state.units).length;
  return { state, log };
}

function newsDays(events: readonly EngineEvent[], key: string): number[] {
  return events.flatMap((event) =>
    event.type === 'news' && event.key === key ? [dayOf(event.step)] : [],
  );
}

describe('3-star hotel with 10 rooms and one housekeeping unit over 14 days (TM-139 playtest)', () => {
  const start = threeStarHotel();
  const unitsAtStart = Object.keys(start.units).length;
  const saveSteps = [at(CHECK_DAY, 10, 20), at(CHECK_DAY, 12)];
  const straight = play(start, at(DAYS, 0), saveSteps);

  it('keeps every unit standing, so the run tests housekeeping only', () => {
    expect(straight.log.unitsAtEnd).toBe(unitsAtStart);
  });

  it('cleans every room left at check-out by 16:30 the same day', () => {
    const checkOuts = straight.log.events.filter((event) => event.type === 'hotelCheckOut');
    expect(checkOuts.length).toBeGreaterThan(20);
    for (const checkOut of checkOuts) {
      const day = dayOf(checkOut.step);
      const cleaned = straight.log.events.find(
        (event) =>
          event.type === 'roomStateChanged' &&
          event.unitId === checkOut.unitId &&
          event.state === 'clean' &&
          event.step > checkOut.step,
      );
      expect(cleaned?.step, `${checkOut.unitId} left on day ${day}`).toBeLessThanOrEqual(
        at(day, 16, 30),
      );
    }
  });

  it('never lets the hotel population fall to 0', () => {
    expect(straight.log.hotelPopulationAt23).toHaveLength(DAYS);
    expect(straight.log.hotelPopulationAt23.every((population) => population > 0)).toBe(true);
  });

  it('never sends the VIP away while a suite is free', () => {
    expect(newsDays(straight.log.events, 'news.vipArrives').length).toBeGreaterThan(0);
    for (const day of newsDays(straight.log.events, 'news.vipNoSuite')) {
      expect(straight.log.freeSuiteAtNoon.has(day), `VIP day ${day}`).toBe(false);
    }
  });

  it.each(saveSteps)('gives the same 14 days after a save and restore at step %i', (saveStep) => {
    const before = play(start, saveStep, saveSteps);
    if (saveStep === at(CHECK_DAY, 10, 20)) expect(maidsCleaning(before.state)).toBeGreaterThan(0);
    const restored = deserializeState(serializeState(before.state));
    const after = play(restored, at(DAYS, 0), saveSteps);
    expect(JSON.parse(serializeState(after.state))).toEqual(
      JSON.parse(serializeState(straight.state)),
    );
  });
});
