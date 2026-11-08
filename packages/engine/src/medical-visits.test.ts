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
