import type { Command, Level, ShaftSchedule } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { joinQueue } from '../elevator-queues';
import { defaultSchedule } from './shafts';
import { accept, fullSiteTower, rejection } from './shaft-test-helpers';

function configure(
  shaftId: string,
  stops: Level[],
  carHomes: Level[],
  schedule: ShaftSchedule = defaultSchedule(),
): Command {
  return { type: 'configureShaft', shaftId, stops, carHomes, schedule };
}

function towerWithShafts() {
  return fullSiteTower([
    { type: 'standard', x: 40, bottom: 1, top: 10 },
    { type: 'express', x: 100, bottom: 1, top: 30 },
  ]);
}

const allLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('new shaft settings', () => {
  it('starts with every level a stop and the default schedule', () => {
    const tower = towerWithShafts();
    expect(tower.shafts.s1?.stops).toEqual(allLevels);
    expect(tower.shafts.s1?.schedule).toEqual(defaultSchedule());
    expect(tower.shafts.s1?.schedule.weekday).toHaveLength(6);
    expect(tower.shafts.s1?.schedule.weekday[0]).toEqual({
      mode: 'normal',
      dwellSeconds: 30,
      responseDistance: 5,
    });
  });
});

describe('configureShaft', () => {
  it('replaces stops, homes and schedule at no cost', () => {
    const schedule = defaultSchedule();
    schedule.weekday[1] = { mode: 'expressUp', dwellSeconds: 10, responseDistance: 8 };
    const { state, spent } = accept(towerWithShafts(), configure('s1', [1, 5, 10], [5], schedule));
    expect(spent).toBe(0);
    expect(state.shafts.s1?.stops).toEqual([1, 5, 10]);
    expect(state.shafts.s1?.cars[0]?.homeLevel).toBe(5);
    expect(state.shafts.s1?.schedule.weekday[1]?.mode).toBe('expressUp');
  });

  it('refuses invalid settings', () => {
    const tower = towerWithShafts();
    const badBand = (change: object) => {
      const schedule = defaultSchedule();
      schedule.weekend[3] = { ...schedule.weekend[3], ...change } as never;
      return configure('s1', allLevels, [1], schedule);
    };
    expect(rejection(tower, configure('s9', allLevels, [1]))).toBe('UNKNOWN_ENTITY');
    expect(rejection(tower, configure('s1', [], []))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, configure('s1', [1, 11], [1]))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, configure('s1', allLevels, []))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, configure('s1', [1, 2], [3]))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, badBand({ dwellSeconds: 25 }))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, badBand({ responseDistance: 0 }))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, badBand({ responseDistance: 100 }))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, badBand({ mode: 'fast' }))).toBe('INVALID_SCHEDULE');
    const short = { ...defaultSchedule(), weekday: defaultSchedule().weekday.slice(1) };
    expect(rejection(tower, configure('s1', allLevels, [1], short))).toBe('INVALID_SCHEDULE');
  });

  it('refuses a non-express stop on an express shaft before other schedule errors', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, configure('s2', [1, 16], [1]))).toBe('EXPRESS_STOP_NOT_ALLOWED');
    expect(rejection(tower, configure('s2', [1, 99], [1]))).toBe('EXPRESS_STOP_NOT_ALLOWED');
  });

  it('drops queues and calls at a disabled stop and moves riders to the nearest stop', () => {
    const tower = towerWithShafts();
    const shaft = tower.shafts.s1;
    if (!shaft) throw new Error('missing shaft');
    joinQueue(shaft, 4, 'up', 'p1', 8, 0);
    joinQueue(shaft, 2, 'up', 'p2', 8, 0);
    const car = shaft.cars[0];
    if (!car) throw new Error('missing car');
    car.level = 8;
    car.direction = 'up';
    car.assigned = [
      { level: 4, direction: 'up' },
      { level: 2, direction: 'up' },
    ];
    car.riders = ['p3'];
    car.trips = [{ destination: 11, boardedStep: 0, waitSteps: 0 }];

    const { state } = accept(tower, configure('s1', [1, 2, 3, 10], [1]));
    const after = state.shafts.s1;
    expect(Object.keys(after?.queues ?? {})).toEqual(['2']);
    expect(after?.cars[0]?.assigned).toEqual([{ level: 2, direction: 'up' }]);
    expect(after?.cars[0]?.trips[0]?.destination).toBe(10);
  });

  it('breaks a tie toward the direction of travel', () => {
    const tower = towerWithShafts();
    const car = tower.shafts.s1?.cars[0];
    if (!car) throw new Error('missing car');
    car.direction = 'up';
    car.riders = ['p1'];
    car.trips = [{ destination: 7, boardedStep: 0, waitSteps: 0 }];
    const { state } = accept(tower, configure('s1', [1, 6, 8], [1]));
    expect(state.shafts.s1?.cars[0]?.trips[0]?.destination).toBe(8);
  });
});

describe('resizeShaft stops', () => {
  it('adds new levels as stops and drops the ones that leave the range', () => {
    const tower = towerWithShafts();
    const resize = (bottom: Level, top: Level): Command => ({
      type: 'resizeShaft',
      shaftId: 's1',
      bottom,
      top,
    });
    const trimmed = accept(tower, configure('s1', [1, 3, 10], [10])).state;
    const shrunk = accept(trimmed, resize(1, 5)).state;
    expect(shrunk.shafts.s1?.stops).toEqual([1, 3]);
    expect(shrunk.shafts.s1?.cars[0]?.homeLevel).toBe(3);
    const grown = accept(shrunk, resize(1, 7)).state;
    expect(grown.shafts.s1?.stops).toEqual([1, 3, 6, 7]);
  });
});
