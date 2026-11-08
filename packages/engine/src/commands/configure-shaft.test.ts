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

  it('keeps all 12 band rows exactly as sent', () => {
    const modes = ['normal', 'expressUp', 'expressDown'] as const;
    const row = (index: number) => ({
      mode: modes[index % 3] ?? 'normal',
      dwellSeconds: (index % 7) * 10,
      responseDistance: index + 1,
    });
    const schedule: ShaftSchedule = {
      weekday: [0, 1, 2, 3, 4, 5].map(row),
      weekend: [6, 7, 8, 9, 10, 11].map(row),
    };
    const { state } = accept(towerWithShafts(), configure('s1', allLevels, [1], schedule));
    expect(state.shafts.s1?.schedule).toEqual(schedule);
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

  it('reports the first failing check: unknown shaft, express stop, then schedule', () => {
    const tower = towerWithShafts();
    const shortDay = { ...defaultSchedule(), weekday: defaultSchedule().weekday.slice(1) };
    expect(rejection(tower, configure('s9', [16, 99], [], shortDay))).toBe('UNKNOWN_ENTITY');
    expect(rejection(tower, configure('s2', [16, 99], [], shortDay))).toBe(
      'EXPRESS_STOP_NOT_ALLOWED',
    );
    expect(rejection(tower, configure('s2', [1], [], shortDay))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, configure('s1', [0, 11], [5], shortDay))).toBe('INVALID_SCHEDULE');
  });

  it('refuses duplicate stops and a home that is not an integer level', () => {
    const tower = towerWithShafts();
    expect(rejection(tower, configure('s1', [1, 1, 2], [1]))).toBe('INVALID_SCHEDULE');
    expect(rejection(tower, configure('s1', allLevels, [1.5]))).toBe('INVALID_COMMAND');
  });

  it('accepts the dwell and response distance limits', () => {
    const schedule = defaultSchedule();
    schedule.weekday[0] = { mode: 'expressDown', dwellSeconds: 0, responseDistance: 1 };
    schedule.weekend[5] = { mode: 'normal', dwellSeconds: 60, responseDistance: 99 };
    const { state } = accept(towerWithShafts(), configure('s1', allLevels, [1], schedule));
    expect(state.shafts.s1?.schedule).toEqual(schedule);
  });

  it('is free and works with a negative balance', () => {
    const tower = towerWithShafts();
    tower.money = -50_000;
    const { state, spent } = accept(tower, configure('s1', [1, 5, 10], [5]));
    expect(spent).toBe(0);
    expect(state.shafts.s1?.stops).toEqual([1, 5, 10]);
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

describe('trimming a shaft (elevators 13.7)', () => {
  it('removes the upper stops, moves homes and moves empty cars to the new top', () => {
    let tower = fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 30 }]);
    tower = accept(tower, { type: 'addCar', shaftId: 's1', homeLevel: 10 }).state;
    tower = accept(tower, { type: 'addCar', shaftId: 's1', homeLevel: 28 }).state;
    const shaft = tower.shafts.s1;
    if (!shaft) throw new Error('missing shaft');
    const car = shaft.cars[1];
    if (!car) throw new Error('missing car');
    car.level = 27;
    joinQueue(shaft, 28, 'down', 'p1', 1, 0);

    const { state } = accept(tower, { type: 'resizeShaft', shaftId: 's1', bottom: 1, top: 25 });

    const after = state.shafts.s1;
    expect(after?.stops).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(after?.cars.map((each) => each.homeLevel)).toEqual([1, 10, 25]);
    expect(after?.cars[1]?.level).toBe(25);
    expect(after?.cars[1]?.phase).toBe('idle');
    expect(Object.keys(after?.queues ?? {})).toEqual([]);
  });
});
