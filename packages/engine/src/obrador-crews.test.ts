import {
  BUILDER_CREW_SIZE,
  type Command,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { crewNoiseFactor, crewOf, decodeBuilderTask, isBuilder } from './construction';
import { outfitOf } from './outfit';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';

const OBRADOR = 'u1';

function tower(upgrades?: Record<string, number>): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(3, 0, 120),
    shafts: [{ type: 'standard', x: 60, bottom: 1, top: 3, cars: 2 }],
    units: [{ type: 'obrador', level: 3, x: 100 }],
  });
  state.money = 99_999_999;
  state.stars = 6;
  state.step = 7 * STEPS_PER_HOUR;
  if (upgrades) (state.units[OBRADOR] as { upgrades?: Record<string, number> }).upgrades = upgrades;
  return state;
}

function build(state: TowerState, x: number, level = 2): TowerState {
  const command: QueuedCommand = {
    id: `c${x}`,
    command: { type: 'buildUnit', unitType: 'office', x, level } as Command,
  };
  const { state: next, results } = step(state, [command], 0);
  expect(results[0]?.ok).toBe(true);
  return next;
}

function advance(state: TowerState, steps: number): TowerState {
  return step(state, [], steps).state;
}

interface Seen {
  crew: number;
  phase: string | undefined;
  site: number | undefined;
  uniform: boolean;
}

function builders(state: TowerState): Seen[] {
  const pool = state.people;
  const seen: Seen[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isBuilder(pool, slot)) continue;
    const task = decodeBuilderTask(pool.trip[slot] as number);
    seen.push({
      crew: crewOf(pool, slot),
      phase: task?.phase,
      site: task?.site,
      uniform: outfitOf(pool, slot) === 'uniform',
    });
  }
  return seen;
}

describe('obrador crews', () => {
  it('brings the obrador crew in everyday clothes next to the crew from outside in work clothes', () => {
    let state = build(build(tower(), 0), 20);
    state = advance(state, STEPS_PER_HOUR + 12);
    const people = builders(state);
    const outside = people.filter((person) => person.crew === 0);
    const own = people.filter((person) => person.crew === 1);
    expect(outside).toHaveLength(BUILDER_CREW_SIZE);
    expect(own).toHaveLength(BUILDER_CREW_SIZE);
    expect(outside.every((person) => person.uniform)).toBe(true);
    expect(own.every((person) => !person.uniform && person.phase === 'arriving')).toBe(true);
  });

  it('changes in the obrador and then works on a site the other crew does not hold', () => {
    let state = build(build(tower(), 0), 20);
    let changed = false;
    for (let minute = 0; minute < 150 && !changed; minute++) {
      state = advance(state, 6);
      changed = builders(state).some(
        (person) => person.crew === 1 && person.phase === 'changingIn',
      );
    }
    expect(changed).toBe(true);
    state = advance(state, 2 * STEPS_PER_HOUR);
    const people = builders(state);
    const sitesOf = (crew: number) =>
      new Set(people.filter((person) => person.crew === crew).map((person) => person.site));
    expect(people.filter((person) => person.crew === 1).every((person) => person.uniform)).toBe(
      true,
    );
    expect(sitesOf(0).size).toBe(1);
    expect(sitesOf(1).size).toBe(1);
    expect([...sitesOf(0)][0]).not.toBe([...sitesOf(1)][0]);
  });

  it('does not bring the obrador crew while the crew from outside is enough for the sites', () => {
    let state = build(tower(), 0);
    state = advance(state, STEPS_PER_HOUR + 12);
    expect(builders(state).filter((person) => person.crew === 1)).toHaveLength(0);
  });

  it('walks back to the obrador and changes before it leaves at the end of the day', () => {
    let state = tower();
    for (const x of [0, 10, 20, 30, 40, 70, 80]) state = build(state, x);
    const phases = new Set<string | undefined>();
    for (let minute = 0; minute < 11 * 60; minute++) {
      state = advance(state, 6);
      for (const person of builders(state)) if (person.crew === 1) phases.add(person.phase);
    }
    expect(phases.has('returning')).toBe(true);
    expect(phases.has('changingOut')).toBe(true);
    state = advance(state, 3 * STEPS_PER_HOUR);
    expect(builders(state)).toHaveLength(0);
  });

  it('adds a builder for each level of storage', () => {
    let state = build(build(tower({ storage: 2 }), 0), 20);
    state = advance(state, STEPS_PER_HOUR + 12);
    expect(builders(state).filter((person) => person.crew === 1)).toHaveLength(
      BUILDER_CREW_SIZE + 2,
    );
  });

  it('builds faster with better tools', () => {
    // At 09:30 neither site is done. The crew from outside takes the first site placed (x 0) and
    // works the same in both runs; the obrador crew takes the other one (x 20).
    const pointsAt930 = (upgrades: Record<string, number>) => {
      let state = build(build(tower(upgrades), 0), 20);
      state = advance(state, 2.5 * STEPS_PER_HOUR);
      expect(Object.keys(state.sites)).toHaveLength(2);
      const pointsAt = (x: number) =>
        Object.values(state.sites).find((site) => site.x === x)?.points ?? 0;
      return { outside: pointsAt(0), own: pointsAt(20) };
    };
    const plain = pointsAt930({});
    const tooled = pointsAt930({ tools: 3 });
    expect(tooled.outside).toBe(plain.outside);
    expect(plain.own).toBeGreaterThan(0);
    expect(tooled.own).toBeGreaterThan(plain.own * 1.4);
  });

  it('makes less noise with quiet equipment', () => {
    const state = tower({ quietEquipment: 2 });
    expect(crewNoiseFactor(state, 1)).toBeCloseTo(0.6);
    expect(crewNoiseFactor(state, 0)).toBe(1);
  });

  it('lets the crew walk out when its obrador is demolished', () => {
    let state = build(build(tower(), 0), 20);
    state = advance(state, 3 * STEPS_PER_HOUR);
    expect(builders(state).filter((person) => person.crew === 1).length).toBeGreaterThan(0);
    const command: QueuedCommand = {
      id: 'd1',
      command: { type: 'demolish', target: { kind: 'unit', id: OBRADOR } } as Command,
    };
    const result = step(state, [command], 0);
    expect(result.results[0]?.ok).toBe(true);
    state = result.state;
    expect(builders(state).filter((person) => person.crew === 1).length).toBeGreaterThan(0);
    state = advance(state, 2 * STEPS_PER_HOUR);
    expect(builders(state).filter((person) => person.crew === 1)).toHaveLength(0);
  });

  it('keeps the crew from outside as the only crew on a tower with no obrador', () => {
    const { state: plain } = buildTower({
      ...plainTowerPlan(3, 0, 120),
      shafts: [{ type: 'standard', x: 60, bottom: 1, top: 3, cars: 2 }],
    });
    plain.money = 99_999_999;
    plain.step = 7 * STEPS_PER_HOUR;
    let state = build(build(plain, 0), 20);
    state = advance(state, STEPS_PER_HOUR + 12);
    expect(builders(state)).toHaveLength(BUILDER_CREW_SIZE);
  });
});
