import {
  CLEANER_CREW_SIZE,
  LAST_COLUMN,
  type Command,
  type Level,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { cleanerRate, decodeCleanerTask, encodeCleanerTask, isCleaner } from './cleaning';
import { outfitOf } from './outfit';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';

const ROOM = 'u1';

/** A 3-level tower with a cleaning room on level 3 and a fast food on level 2, at 05:59. */
function tower(upgrades?: Record<string, number>): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(3, 0, 120),
    shafts: [{ type: 'standard', x: 60, bottom: 1, top: 3, cars: 2 }],
    units: [
      { type: 'cleaning-room', level: 3, x: 100 },
      { type: 'fast-food', level: 2, x: 80 },
    ],
  });
  state.money = 99_999_999;
  state.stars = 6;
  state.step = 6 * STEPS_PER_HOUR - 6;
  if (upgrades) (state.units[ROOM] as { upgrades?: Record<string, number> }).upgrades = upgrades;
  return state;
}

/** Puts `amount` of dirt on the cells of level 2 given as column: amount. */
function dirty(state: TowerState, cells: Record<number, number>): void {
  const row = new Array<number>(LAST_COLUMN + 1).fill(0);
  for (const [column, amount] of Object.entries(cells)) row[Number(column)] = amount;
  state.heat = { noise: {}, dirt: { '2': row }, cars: {} };
}

function dirtAt(state: TowerState, column: number): number {
  return state.heat?.dirt['2']?.[column] ?? 0;
}

function advance(state: TowerState, steps: number): TowerState {
  return step(state, [], steps).state;
}

interface Seen {
  phase: string | undefined;
  target: number | undefined;
  shift: number | undefined;
  uniform: boolean;
}

function cleaners(state: TowerState): Seen[] {
  const pool = state.people;
  const seen: Seen[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isCleaner(pool, slot)) continue;
    const task = decodeCleanerTask(pool.trip[slot] as number);
    seen.push({
      phase: task?.phase,
      target: task?.target,
      shift: task?.shift,
      uniform: outfitOf(pool, slot) === 'uniform',
    });
  }
  return seen;
}

describe('cleaning room', () => {
  it('brings its crew at 06:00 in everyday clothes, and they change in the room', () => {
    let state = advance(tower(), 12);
    const arrived = cleaners(state);
    expect(arrived).toHaveLength(CLEANER_CREW_SIZE);
    expect(arrived.every((person) => person.phase === 'arriving' && !person.uniform)).toBe(true);
    let changed = false;
    for (let minute = 0; minute < 60 && !changed; minute++) {
      state = advance(state, 6);
      changed = cleaners(state).some((person) => person.phase === 'changingIn');
    }
    expect(changed).toBe(true);
    state = advance(state, STEPS_PER_HOUR);
    expect(cleaners(state).every((person) => person.uniform)).toBe(true);
  });

  it('cleans the dirtiest spot until it is clean', () => {
    const state = tower();
    dirty(state, { 30: 20 });
    const later = advance(state, 2 * STEPS_PER_HOUR);
    expect(dirtAt(later, 30)).toBeLessThan(0.5);
  });

  it('reaches the cells beside the spot with materials', () => {
    const run = (upgrades: Record<string, number>) => {
      const state = tower(upgrades);
      dirty(state, { 30: 20, 31: 0.4, 33: 0.4 });
      return advance(state, 2 * STEPS_PER_HOUR);
    };
    const plain = run({});
    expect(dirtAt(plain, 31)).toBeGreaterThan(0.35);
    const reached = run({ materials: 1 });
    expect(dirtAt(reached, 31)).toBeLessThan(0.05);
    expect(dirtAt(reached, 33)).toBeGreaterThan(0.35);
  });

  it('takes the bags of a garbage pile out to the street, more at a time with tools', () => {
    const run = (upgrades: Record<string, number>) => {
      let state = tower(upgrades);
      const venue = state.units.u2?.venue;
      if (!venue) throw new Error('the fast food has no venue day');
      venue.garbage = 3;
      let most = 0;
      for (let minute = 0; minute < 120; minute++) {
        state = advance(state, 6);
        for (const person of cleaners(state)) {
          if (person.phase === 'carrying') most = Math.max(most, person.target ?? 0);
        }
      }
      return { state, most };
    };
    const plain = run({});
    expect(plain.state.units.u2?.venue?.garbage).toBe(0);
    expect(plain.most).toBe(1);
    expect(run({ tools: 2 }).most).toBe(3);
  });

  it('carries the bags to a recycling center when the tower has one', () => {
    const { state: built } = buildTower({
      lobby: { x0: 0, x1: 120 },
      floors: [
        { from: 2, to: 3 as Level, x0: 0, x1: 120 },
        { from: -2 as Level, to: -1 as Level, x0: 0, x1: 120 },
      ],
      shafts: [{ type: 'standard', x: 60, bottom: -2 as Level, top: 3 as Level, cars: 2 }],
      units: [
        { type: 'cleaning-room', level: 3 as Level, x: 100 },
        { type: 'fast-food', level: 2 as Level, x: 80 },
        { type: 'recycling-center', level: -2 as Level, x: 10 },
      ],
    });
    let state = built;
    state.money = 99_999_999;
    state.stars = 6;
    state.step = 6 * STEPS_PER_HOUR - 6;
    const recycling = Object.values(state.units).find((unit) => unit.type === 'recycling-center');
    (state.units.u2?.venue as { garbage: number }).garbage = 2;
    const levels = new Set<number>();
    for (let minute = 0; minute < 180; minute++) {
      state = advance(state, 6);
      const pool = state.people;
      for (let slot = 0; slot < pool.id.length; slot++) {
        if (!isCleaner(pool, slot)) continue;
        if (decodeCleanerTask(pool.trip[slot] as number)?.phase === 'carrying') {
          levels.add(pool.level[slot] as number);
        }
      }
    }
    expect(state.units.u2?.venue?.garbage).toBe(0);
    expect(levels.has(recycling?.level as number)).toBe(true);
  });

  it('adds cleaners with staff and takes dirt off faster with collection speed', () => {
    const state = advance(tower({ staff: 2 }), 12);
    expect(cleaners(state)).toHaveLength(CLEANER_CREW_SIZE + 4);
    expect(cleanerRate(null)).toBe(1);
    expect(cleanerRate(tower({ collectionSpeed: 2 }).units[ROOM] ?? null)).toBeCloseTo(1.5);
  });

  it('changes in the room before it leaves at the end of its 8-hour shift', () => {
    let state = tower();
    const phases = new Set<string | undefined>();
    for (let minute = 0; minute < 8 * 60 + 30; minute++) {
      state = advance(state, 6);
      for (const person of cleaners(state)) if (person.shift === 0) phases.add(person.phase);
    }
    // A cleaner waiting at the room door changes there without walking back.
    expect(phases.has('changingOut')).toBe(true);
    state = advance(state, 2 * STEPS_PER_HOUR);
    expect(cleaners(state).filter((person) => person.shift === 0)).toHaveLength(0);
  });

  it('keeps a crew in the tower day and night, in shifts of 06:00, 14:00 and 22:00', () => {
    let state = tower();
    // 05:59 + 4 hours: the morning crew works.
    state = advance(state, 4 * STEPS_PER_HOUR);
    expect(cleaners(state).map((person) => person.shift)).toEqual([0, 0, 0]);
    // 16:00: the afternoon crew has taken over and the morning crew has left.
    state = advance(state, 6 * STEPS_PER_HOUR);
    expect(cleaners(state).map((person) => person.shift)).toEqual([1, 1, 1]);
    expect(cleaners(state).every((person) => person.uniform)).toBe(true);
    // 03:00: the night crew.
    state = advance(state, 11 * STEPS_PER_HOUR);
    expect(cleaners(state).map((person) => person.shift)).toEqual([2, 2, 2]);
    expect(cleaners(state).every((person) => person.uniform)).toBe(true);
  });

  it('reads a cleaner saved before shifts as one of the shift under way', () => {
    expect(
      decodeCleanerTask(encodeCleanerTask({ phase: 'cleaning', target: 812, shift: 2 })),
    ).toEqual({
      phase: 'cleaning',
      target: 812,
      shift: 2,
    });
    // Old saves packed only the phase and the target.
    expect(decodeCleanerTask(812 * 11 + 6 + 1)).toEqual({
      phase: 'cleaning',
      target: 812,
      shift: null,
    });
  });

  it('lets the crew walk out when its room is demolished', () => {
    let state = advance(tower(), STEPS_PER_HOUR);
    expect(cleaners(state).length).toBeGreaterThan(0);
    const command: QueuedCommand = {
      id: 'd1',
      command: { type: 'demolish', target: { kind: 'unit', id: ROOM } } as Command,
    };
    const result = step(state, [command], 0);
    expect(result.results[0]?.ok).toBe(true);
    state = result.state;
    expect(cleaners(state).length).toBeGreaterThan(0);
    state = advance(state, 2 * STEPS_PER_HOUR);
    expect(cleaners(state)).toHaveLength(0);
  });

  it('has no cleaners in a tower with no cleaning room', () => {
    const { state: plain } = buildTower({
      ...plainTowerPlan(3, 0, 120),
      shafts: [{ type: 'standard', x: 60, bottom: 1, top: 3, cars: 2 }],
    });
    plain.step = 6 * STEPS_PER_HOUR - 6;
    expect(cleaners(advance(plain, STEPS_PER_HOUR))).toHaveLength(0);
  });
});
