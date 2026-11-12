import {
  CINEMA_MOVIE_CHANGE_COST,
  type TowerState,
  type Unit,
  type UnitId,
  type VenueDay,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { towerCommandHandlers } from './commands';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { cinemaShowCap, filmAgeDays, filmNewsHook } from './films';
import { createScheduler } from './scheduler';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';

const engine = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: [createScheduler([filmNewsHook])],
});

function towerWith(type: 'cinema' | 'office'): { tower: TowerState; unitId: UnitId } {
  const plan = { ...plainTowerPlan(3, 0, 60), units: [{ type, x: 0, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  return { tower: state, unitId: unitIds[0] as UnitId };
}

function unitOf(tower: TowerState, unitId: UnitId): Unit {
  const unit = tower.units[unitId];
  if (!unit) throw new Error(`Unit ${unitId} is missing`);
  return unit;
}

function venueOf(tower: TowerState, unitId: UnitId): VenueDay {
  const { venue } = unitOf(tower, unitId);
  if (!venue) throw new Error(`Unit ${unitId} keeps no venue counts`);
  return venue;
}

function cinemaAgeOf(tower: TowerState, unitId: UnitId): number {
  const age = filmAgeDays(tower, unitOf(tower, unitId));
  if (age === null) throw new Error(`Unit ${unitId} is not a cinema`);
  return age;
}

function changeFilmCommand(unitId: string) {
  return { id: 'c1', command: { type: 'changeFilm' as const, unitId } };
}

/** The days on which the cinema's film news is sent; only the step of the hook is simulated. */
function newsDays(tower: TowerState, unitId: UnitId, days: number): number[] {
  const hookStepOfDay = 8 * STEPS_PER_HOUR;
  const newsDaysSeen: number[] = [];
  let state = tower;
  for (let day = 0; day < days; day++) {
    state = { ...state, step: day * STEPS_PER_DAY + hookStepOfDay - 1 };
    const result = engine.step(state, [], 1);
    state = result.state;
    if (result.events.some((event) => event.type === 'news' && event.unitId === unitId)) {
      newsDaysSeen.push(day);
    }
  }
  return newsDaysSeen;
}

describe('cinemaShowCap', () => {
  it.each([
    [0, 120],
    [13, 120],
    [14, 100],
    [27, 100],
    [28, 85],
    [41, 85],
    [42, 65],
    [55, 65],
    [56, 35],
    [200, 35],
  ])('caps a film of %i days at %i', (age, cap) => {
    expect(cinemaShowCap(age)).toBe(cap);
  });
});

describe('filmAgeDays', () => {
  it('starts at 0 on the day the cinema is placed and counts whole days', () => {
    const { tower, unitId } = towerWith('cinema');
    expect(cinemaAgeOf(tower, unitId)).toBe(0);
    tower.step = STEPS_PER_DAY - 1;
    expect(cinemaAgeOf(tower, unitId)).toBe(0);
    tower.step = STEPS_PER_DAY;
    expect(cinemaAgeOf(tower, unitId)).toBe(1);
  });

  it('is null for a unit that is not a cinema', () => {
    const { tower, unitId } = towerWith('office');
    expect(filmAgeDays(tower, unitOf(tower, unitId))).toBeNull();
  });
});

describe('changeFilm', () => {
  function readyCinema(money: number, day = 20) {
    const { tower, unitId } = towerWith('cinema');
    tower.money = money;
    tower.step = day * STEPS_PER_DAY + 5;
    return { tower, unitId };
  }

  it('charges 300,000 under films and returns the age to 0', () => {
    const { tower, unitId } = readyCinema(1_000_000);
    expect(cinemaShowCap(cinemaAgeOf(tower, unitId))).toBe(100);
    const { state, results } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(results[0]).toMatchObject({ ok: true, cost: CINEMA_MOVIE_CHANGE_COST });
    expect(state.money).toBe(700_000);
    expect(state.ledger.currentWeek.films.expense).toBe(-300_000);
    expect(cinemaAgeOf(state, unitId)).toBe(0);
    expect(cinemaShowCap(cinemaAgeOf(state, unitId))).toBe(120);
  });

  it('accepts a balance of exactly 300,000', () => {
    const { tower, unitId } = readyCinema(300_000);
    const { state, results } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(results[0]).toMatchObject({ ok: true });
    expect(state.money).toBe(0);
  });

  it('refuses 299,999 with INSUFFICIENT_FUNDS and changes nothing', () => {
    const { tower, unitId } = readyCinema(299_999);
    const { state, results } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'INSUFFICIENT_FUNDS' });
    expect(state.money).toBe(299_999);
    expect(cinemaAgeOf(state, unitId)).toBe(20);
  });

  it('refuses a negative balance with NEGATIVE_BALANCE', () => {
    const { tower, unitId } = readyCinema(-1);
    const { results } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'NEGATIVE_BALANCE' });
  });

  it('refuses a unit that is not a cinema with NOT_A_CINEMA', () => {
    const { tower, unitId } = towerWith('office');
    tower.money = 1_000_000;
    const { results } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'NOT_A_CINEMA' });
  });

  it('refuses an unknown id with UNKNOWN_ENTITY', () => {
    const { tower } = readyCinema(1_000_000);
    const { results } = engine.step(tower, [changeFilmCommand('u999')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'UNKNOWN_ENTITY' });
  });

  it('does not touch the visits of a show that is running', () => {
    const { tower, unitId } = readyCinema(1_000_000);
    venueOf(tower, unitId).visits = 77;
    const { state } = engine.step(tower, [changeFilmCommand(unitId)], 0);
    expect(state.units[unitId]?.venue?.visits).toBe(77);
  });
});

describe('film news', () => {
  it('is sent on days 56, 63 and 70 of the same film and not on day 57', () => {
    const { tower, unitId } = towerWith('cinema');
    expect(newsDays(tower, unitId, 71)).toEqual([56, 63, 70]);
  });

  it('restarts the count after a film change', () => {
    const { tower, unitId } = towerWith('cinema');
    venueOf(tower, unitId).filmChangedAtStep = 30 * STEPS_PER_DAY;
    expect(newsDays(tower, unitId, 90)).toEqual([86]);
  });

  it('is not sent for other units', () => {
    const { tower, unitId } = towerWith('office');
    expect(newsDays(tower, unitId, 60)).toEqual([]);
  });
});
