import {
  MEDICAL_CENTER_DAILY_VISITS,
  type Level,
  type StarRating,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { ledgerWeekRollHook } from './money';
import {
  createOfficeRoutine,
  decodeRoutine,
  encodeRoutine,
  straightLineRoutes,
  type OfficeRoutine,
} from './office-routine';
import { addPeopleForUnit } from './people';
import { createScheduler } from './scheduler';
import { hashState } from './hash';
import { deserializeState, serializeState } from './serialization';
import { createEngine, type SimulationSystem } from './step';
import { buildTower } from './testing';

interface Options {
  stars: StarRating;
  centers: number;
  offices: number;
  /** Every worker gets a medical visit instead of 10% of them. */
  everyone: boolean;
}

function tower(options: Options): TowerState {
  const units = [];
  for (let index = 0; index < options.centers; index++) {
    units.push({ type: 'medical-center' as const, level: 2 as Level, x: index * 26 });
  }
  for (let index = 0; index < options.offices; index++) {
    units.push({
      type: 'office' as const,
      level: (3 + Math.floor(index / 8)) as Level,
      x: (index % 8) * 9,
    });
  }
  const top = 3 + Math.ceil(options.offices / 8);
  const { state, unitIds } = buildTower({
    seed: 7,
    lobby: { x0: 0, x1: 79 },
    floors: [{ from: 2, to: top as Level, x0: 0, x1: 79 }],
    units,
  });
  state.stars = options.stars;
  for (const officeId of unitIds.slice(options.centers)) addPeopleForUnit(state, officeId);
  return state;
}

function flagEveryone(): SimulationSystem {
  return ({ state }) => {
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const routine = decodeRoutine(pool.trip[slot] ?? 0);
      if (routine?.phase === 'waitingToArrive' && !routine.medical) {
        pool.trip[slot] = encodeRoutine({ ...routine, medical: true });
      }
    }
  };
}

/** Day 0 has no plans (they start at the first 00:00 step), so the run covers days 1 to `days`. */
function runWeekday(options: Options, days = 1) {
  const routine = createOfficeRoutine(straightLineRoutes);
  const systems: SimulationSystem[] = [createScheduler([ledgerWeekRollHook, routine.planHook])];
  if (options.everyone) systems.push(flagEveryone());
  systems.push(routine.system);
  const engine = createEngine({ commandHandlers: {}, systems });
  return engine.step(tower(options), [], STEPS_PER_DAY * (days + 1) - 1);
}

function news(events: { type: string; key?: string }[], key: string): number {
  return events.filter((event) => event.type === 'news' && event.key === key).length;
}

const base: Options = { stars: 3, centers: 1, offices: 20, everyone: true };

describe('medical visits', () => {
  it('keeps the flag when a routine is packed and read back', () => {
    const routine: OfficeRoutine = {
      phase: 'atMedical',
      lunchHandled: true,
      entranceOnRight: true,
      venue: 12,
      medical: true,
      lunchMinute: 750,
      leaveMinute: 1050,
    };
    expect(decodeRoutine(encodeRoutine(routine))).toEqual(routine);
    expect(decodeRoutine(encodeRoutine({ ...routine, medical: false }))?.medical).toBe(false);
  });

  it('sends some workers to the center from 3 stars', () => {
    const result = runWeekday({ ...base, everyone: false, offices: 40 });
    const visits = result.state.medicalDay.visits;
    const total = Object.values(visits).reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(240 * 0.25);
    expect(result.state.lastMedicalFailureStep).toBeNull();
  });

  it('sends nobody below 3 stars', () => {
    const result = runWeekday({ ...base, stars: 2, everyone: false, offices: 40 });
    expect(result.state.medicalDay.visits).toEqual({});
    expect(result.state.lastMedicalFailureStep).toBeNull();
  });

  it('records a failure and one notice a day when the tower has no center', () => {
    const result = runWeekday({ ...base, centers: 0 });
    expect(result.state.lastMedicalFailureStep).not.toBeNull();
    expect(news(result.events, 'news.medicalDemanded')).toBe(1);
    expect(news(result.events, 'news.medicalFull')).toBe(0);
  });

  it('shows the notice again on the next day', () => {
    const result = runWeekday({ ...base, centers: 0 }, 2);
    expect(news(result.events, 'news.medicalDemanded')).toBe(2);
  });

  it('sends nobody to the center on the weekend', () => {
    const result = runWeekday({ ...base, centers: 0, offices: 2 }, 7);
    expect(news(result.events, 'news.medicalDemanded')).toBe(5);
  });

  it('takes 100 visits a day and fails the 101st', () => {
    const result = runWeekday({ ...base, offices: 20 });
    const [count] = Object.values(result.state.medicalDay.visits);
    expect(count).toBe(MEDICAL_CENTER_DAILY_VISITS);
    expect(result.state.lastMedicalFailureStep).not.toBeNull();
    expect(news(result.events, 'news.medicalFull')).toBe(1);
  });

  it('spreads the visits over a second center and fails nobody', () => {
    const result = runWeekday({ ...base, centers: 2 });
    const total = Object.values(result.state.medicalDay.visits).reduce((a, b) => a + b, 0);
    expect(total).toBe(120);
    expect(result.state.lastMedicalFailureStep).toBeNull();
  });
});

interface PlaytestTower {
  offices: number;
  centers: number;
}

const COLUMNS = 375;
const OFFICES_PER_FLOOR = Math.floor(COLUMNS / 9);
const CENTERS_PER_FLOOR = Math.floor(COLUMNS / 26);

/** Medical centers on the lowest floors, then offices across the full site width; 3 stars. */
function playtestTower({ offices, centers }: PlaytestTower): TowerState {
  const units = [];
  for (let index = 0; index < centers; index++) {
    const level = (2 + Math.floor(index / CENTERS_PER_FLOOR)) as Level;
    units.push({ type: 'medical-center' as const, level, x: (index % CENTERS_PER_FLOOR) * 26 });
  }
  const firstOfficeLevel = 3 + Math.floor((centers - 1) / CENTERS_PER_FLOOR);
  for (let index = 0; index < offices; index++) {
    const level = (firstOfficeLevel + Math.floor(index / OFFICES_PER_FLOOR)) as Level;
    units.push({ type: 'office' as const, level, x: (index % OFFICES_PER_FLOOR) * 9 });
  }
  const top = firstOfficeLevel + Math.ceil(offices / OFFICES_PER_FLOOR);
  const { state, unitIds } = buildTower({
    seed: 11,
    lobby: { x0: 0, x1: COLUMNS - 1 },
    floors: [{ from: 2, to: top as Level, x0: 0, x1: COLUMNS - 1 }],
    units,
  });
  state.stars = 3;
  for (const officeId of unitIds.slice(centers)) addPeopleForUnit(state, officeId);
  return state;
}

interface PlaytestLog {
  /** Most visits any center had on any day. */
  mostVisits: number;
  failureDays: Set<number>;
}

function logSystem(log: PlaytestLog): SimulationSystem {
  return ({ state }) => {
    for (const count of Object.values(state.medicalDay.visits)) {
      log.mostVisits = Math.max(log.mostVisits, count);
    }
    if (state.lastMedicalFailureStep === state.step) {
      log.failureDays.add(Math.floor(state.step / STEPS_PER_DAY));
    }
  };
}

function playtestEngine(log: PlaytestLog) {
  const routine = createOfficeRoutine(straightLineRoutes);
  return createEngine({
    commandHandlers: {},
    systems: [
      createScheduler([ledgerWeekRollHook, routine.planHook]),
      routine.system,
      logSystem(log),
    ],
  });
}

/** Days 1 to 7 from Tuesday: five weekdays (days 1 to 4 and 7) and a weekend. */
const PLAYTEST_STEPS = STEPS_PER_DAY * 8 - 1;

function playtest(tower: PlaytestTower, steps = PLAYTEST_STEPS) {
  const log: PlaytestLog = { mostVisits: 0, failureDays: new Set() };
  const result = playtestEngine(log).step(playtestTower(tower), [], steps);
  return { ...result, log };
}

function noticesByDay(events: readonly { type: string; step?: number }[]): number[] {
  const counts: number[] = [];
  for (const event of events) {
    if (event.type !== 'news' || event.step === undefined) continue;
    const day = Math.floor(event.step / STEPS_PER_DAY);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts.filter((count) => count !== undefined);
}

describe('medical reservations (TM-139 playtest towers)', () => {
  it('fails no visit with 918 offices and 9 centers over five weekdays', () => {
    const { state, log } = playtest({ offices: 918, centers: 9 });
    expect(log.failureDays.size).toBe(0);
    expect(state.lastMedicalFailureStep).toBeNull();
    expect(log.mostVisits).toBeLessThanOrEqual(MEDICAL_CENTER_DAILY_VISITS);
  });

  it('fails no visit with 565 offices and 5 centers over five weekdays', () => {
    const { state, log } = playtest({ offices: 565, centers: 5 });
    expect(log.failureDays.size).toBe(0);
    expect(state.lastMedicalFailureStep).toBeNull();
    expect(log.mostVisits).toBeLessThanOrEqual(MEDICAL_CENTER_DAILY_VISITS);
  });

  it('fails visits with 1,000 offices and 5 centers, with one notice a day at most', () => {
    const { events, log } = playtest({ offices: 1000, centers: 5 });
    expect([...log.failureDays].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 7]);
    expect(log.mostVisits).toBe(MEDICAL_CENTER_DAILY_VISITS);
    expect(noticesByDay(events).every((count) => count === 1)).toBe(true);
  });

  it('gives the same state after a save and restore while workers travel to a center', () => {
    const tower = { offices: 565, centers: 5 };
    const straight = playtest(tower);
    const log: PlaytestLog = { mostVisits: 0, failureDays: new Set() };
    const engine = playtestEngine(log);
    const midway = engine.step(playtestTower(tower), [], STEPS_PER_DAY * 2 + 17 * 360);
    const travelling = midway.state.people.trip.filter(
      (trip) => decodeRoutine(trip)?.phase === 'toMedical',
    );
    expect(travelling.length).toBeGreaterThan(0);
    const restored = deserializeState(serializeState(midway.state));
    const resumed = engine.step(restored, [], PLAYTEST_STEPS - midway.state.step);
    expect(hashState(resumed.state)).toBe(hashState(straight.state));
  });

  it('gives the same state hash for the same seed', () => {
    const tower = { offices: 565, centers: 5 };
    expect(hashState(playtest(tower).state)).toBe(hashState(playtest(tower).state));
  });
});
