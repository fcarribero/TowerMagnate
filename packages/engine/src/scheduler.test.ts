import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, stepOfDate, WEEKDAYS } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createScheduler, type HookOccurrence, type ScheduledHook } from './scheduler';
import { createTower } from './state';
import { createEngine } from './step';

function recorder(name: string, schedule: ScheduledHook['schedule'], log: string[]) {
  const occurrences: HookOccurrence[] = [];
  const hook: ScheduledHook = {
    name,
    schedule,
    run(_context, occurrence) {
      occurrences.push(occurrence);
      log.push(name);
    },
  };
  return { hook, occurrences };
}

function engineWith(hooks: ScheduledHook[]) {
  return createEngine({ commandHandlers: {}, systems: [createScheduler(hooks)] });
}

describe('createScheduler', () => {
  it('counts Monday 00:00 and weekday 17:00 firings over 14 days', () => {
    const log: string[] = [];
    const upkeep = recorder(
      'upkeep',
      { every: 'week', weekday: WEEKDAYS.monday, hour: 0, minute: 0 },
      log,
    );
    const stars = recorder('stars', { every: 'weekday', hour: 17, minute: 0 }, log);
    engineWith([upkeep.hook, stars.hook]).runDays(createTower(1), 14);
    expect(upkeep.occurrences.map((o) => o.dayNumber)).toEqual([7, 14]);
    expect(stars.occurrences).toHaveLength(10);
  });

  it('skips Saturday and Sunday for weekday hooks', () => {
    const stars = recorder('stars', { every: 'weekday', hour: 17, minute: 0 }, []);
    engineWith([stars.hook]).runDays(createTower(1), 7);
    expect(stars.occurrences.map((o) => o.weekday)).toEqual([0, 1, 2, 3, 4]);
  });

  it('fires a daily hook once per day at the exact step', () => {
    const noon = recorder('noon', { every: 'day', hour: 12, minute: 30 }, []);
    engineWith([noon.hook]).runDays(createTower(1), 3);
    expect(noon.occurrences.map((o) => o.step)).toEqual(
      [0, 1, 2].map((day) => day * STEPS_PER_DAY + 12 * STEPS_PER_HOUR + 180),
    );
  });

  it('fires the same number of times however the steps are split across calls', () => {
    const counts: number[] = [];
    for (const chunk of [1, 7, 997, STEPS_PER_DAY, 3 * STEPS_PER_DAY]) {
      const daily = recorder('daily', { every: 'day', hour: 6, minute: 0 }, []);
      const engine = engineWith([daily.hook]);
      let state = createTower(1);
      let remaining = 4 * STEPS_PER_DAY;
      while (remaining > 0) {
        const steps = Math.min(chunk, remaining);
        state = engine.step(state, [], steps).state;
        remaining -= steps;
      }
      counts.push(daily.occurrences.length);
    }
    expect(counts).toEqual([4, 4, 4, 4, 4]);
  });

  it('runs hooks due at the same step in listed order', () => {
    const log: string[] = [];
    const schedule = { every: 'day', hour: 0, minute: 0 } as const;
    const hooks = ['b', 'a', 'c'].map((name) => recorder(name, schedule, log).hook);
    engineWith(hooks).runDays(createTower(1), 2);
    expect(log).toEqual(['b', 'a', 'c', 'b', 'a', 'c']);
  });

  it('gives the hook the working state so it can change the tower', () => {
    const engine = engineWith([
      {
        name: 'bump',
        schedule: { every: 'day', hour: 1, minute: 0 },
        run(context) {
          context.state.nextId += 1;
        },
      },
    ]);
    expect(engine.runDays(createTower(1), 5).state.nextId).toBe(6);
  });

  it('fires on the right calendar date', () => {
    const log: string[] = [];
    const monday = recorder(
      'monday',
      { every: 'week', weekday: WEEKDAYS.monday, hour: 0, minute: 0 },
      log,
    );
    engineWith([monday.hook]).runDays(createTower(1), 8);
    expect(monday.occurrences[0]?.step).toBe(stepOfDate({ year: 1, month: 1, day: 8 }));
  });

  it.each([
    ['an hour of 24', { every: 'day', hour: 24, minute: 0 }],
    ['a negative minute', { every: 'day', hour: 1, minute: -1 }],
    ['a fractional minute', { every: 'day', hour: 1, minute: 0.5 }],
    ['a weekday of 7', { every: 'week', weekday: 7, hour: 0, minute: 0 }],
  ])('refuses %s', (_label, schedule) => {
    const hook = { name: 'bad', schedule, run() {} } as unknown as ScheduledHook;
    expect(() => createScheduler([hook])).toThrow(RangeError);
  });

  it('refuses two hooks with the same name', () => {
    const schedule = { every: 'day', hour: 0, minute: 0 } as const;
    const hook = { name: 'twice', schedule, run() {} };
    expect(() => createScheduler([hook, hook])).toThrow(/twice/);
  });
});
