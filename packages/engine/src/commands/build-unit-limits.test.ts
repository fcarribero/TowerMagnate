import {
  PlaceableUnitTypeSchema,
  TOWER_LIMITS,
  UNIT_CATALOG,
  type LimitGroupId,
  type QueuedCommand,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { removeOccupant } from '../grid';
import { hashState } from '../hash';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';
import { newUnit } from '../units';

function wideTower(stars: TowerState['stars']): TowerState {
  const plan = plainTowerPlan(100, 0, 374);
  plan.floors = [
    ...(plan.floors ?? []),
    { from: 101, to: 101, x0: 0, x1: 374 },
    { from: -9, to: -1, x0: 0, x1: 374 },
  ];
  const { state } = buildTower(plan);
  state.money = 99_999_999;
  state.stars = stars;
  return state;
}

function unit(unitType: string, x: number, level: number): QueuedCommand {
  return { id: 'c1', command: { type: 'buildUnit', unitType, x, level } as never };
}

function run(tower: TowerState, command: QueuedCommand) {
  const { state, results } = step(tower, [command], 0);
  const [result] = results;
  if (!result) throw new Error('Expected one command result');
  return { state, result };
}

function rejection(tower: TowerState, command: QueuedCommand) {
  const before = hashState(tower);
  const { state, result } = run(tower, command);
  expect(hashState(state)).toBe(before);
  return result.ok ? null : result.error;
}

/** Counts `count` units of the type toward a limit without laying them on the grid. */
function withStanding(tower: TowerState, unitType: UnitType, count: number): TowerState {
  for (let index = 0; index < count; index++) {
    const id = `u${900 + Object.keys(tower.units).length}`;
    tower.units[id] = newUnit(id, unitType, 0, 2);
  }
  return tower;
}

describe('buildUnit star unlock', () => {
  it('rejects a restaurant at 2 stars as STAR_LOCKED and accepts it at 3', () => {
    expect(rejection(wideTower(2), unit('restaurant', 0, 2))).toBe('STAR_LOCKED');
    expect(run(wideTower(3), unit('restaurant', 0, 2)).result.ok).toBe(true);
  });

  it.each(PlaceableUnitTypeSchema.options)(
    'locks %s one star below its unlock rating',
    (unitType) => {
      const unlockStars = UNIT_CATALOG[unitType].unlockStars;
      if (unlockStars === 1) return;
      const locked = (unlockStars - 1) as TowerState['stars'];
      expect(rejection(wideTower(locked), unit(unitType, 0, 2))).toBe('STAR_LOCKED');
    },
  );

  it('answers STAR_LOCKED before any placement rule', () => {
    expect(rejection(wideTower(2), unit('restaurant', 400, 2))).toBe('STAR_LOCKED');
    expect(rejection(wideTower(1), unit('cathedral', 0, 2))).toBe('STAR_LOCKED');
  });

  it('answers NEGATIVE_BALANCE before STAR_LOCKED', () => {
    const tower = wideTower(1);
    tower.money = -1;
    expect(rejection(tower, unit('restaurant', 0, 2))).toBe('NEGATIVE_BALANCE');
  });

  it('charges nothing for a locked unit', () => {
    const tower = wideTower(2);
    const { state } = run(tower, unit('restaurant', 0, 2));
    expect(state.money).toBe(tower.money);
  });
});

describe('buildUnit limit groups', () => {
  const LIMITED: readonly [LimitGroupId, UnitType, number, number][] = [
    ['security', 'security', 10, 2],
    ['medical', 'medical-center', 10, 2],
    ['entertainment', 'cinema', 16, 2],
    ['entertainment', 'party-hall', 16, 2],
    ['commercial', 'fast-food', 512, 2],
    ['commercial', 'restaurant', 512, 2],
    ['commercial', 'retail-shop', 512, 2],
    ['parking', 'parking-space', 512, -1],
    ['subway', 'subway-station', 1, -9],
    ['cathedral', 'cathedral', 1, 101],
  ];

  it.each(LIMITED)('%s: %s allows %i and rejects one more', (group, unitType, limit, level) => {
    expect(TOWER_LIMITS[group]).toBe(limit);
    const atBoundary = withStanding(wideTower(6), unitType, limit - 1);
    const last = run(atBoundary, unit(unitType, 0, level));
    expect(last.result.ok).toBe(true);
    expect(rejection(last.state, unit(unitType, 200, level))).toBe('LIMIT_REACHED');
  });

  it('counts the units of one group together', () => {
    const tower = withStanding(wideTower(6), 'cinema', 10);
    withStanding(tower, 'party-hall', 6);
    expect(rejection(tower, unit('cinema', 0, 2))).toBe('LIMIT_REACHED');
    expect(rejection(tower, unit('party-hall', 0, 2))).toBe('LIMIT_REACHED');
  });

  it('does not count units of other groups', () => {
    const tower = withStanding(wideTower(6), 'security', 10);
    expect(run(tower, unit('medical-center', 0, 2)).result.ok).toBe(true);
  });

  it('rejects the 11th security office and accepts one after a demolition', () => {
    let tower = wideTower(6);
    for (let index = 0; index < 10; index++) {
      const outcome = run(tower, unit('security', index * 16, 2));
      expect(outcome.result.ok).toBe(true);
      tower = outcome.state;
    }
    expect(rejection(tower, unit('security', 160, 2))).toBe('LIMIT_REACHED');

    const freed = tower.units.u1;
    if (!freed) throw new Error('Expected the first security office');
    delete tower.units.u1;
    removeOccupant(tower.grid, 2, { kind: 'unit', id: 'u1' });
    expect(run(tower, unit('security', 160, 2)).result.ok).toBe(true);
  });

  it('answers LIMIT_REACHED before placement rules and after STAR_LOCKED', () => {
    const full = withStanding(wideTower(6), 'security', 10);
    expect(rejection(full, unit('security', 400, 2))).toBe('LIMIT_REACHED');
    const locked = withStanding(wideTower(1), 'security', 10);
    expect(rejection(locked, unit('security', 0, 2))).toBe('STAR_LOCKED');
  });

  it('puts no limit on unlimited units', () => {
    const tower = withStanding(wideTower(6), 'office', 600);
    expect(run(tower, unit('office', 0, 2)).result.ok).toBe(true);
  });
});
