import {
  UNIT_CATALOG,
  type Level,
  type QueuedCommand,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { clearStructure, occupantAt, setStructure, structureAt } from '../grid';
import { hashState } from '../hash';
import { createTower } from '../state';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';

function towerWithMainLobby(x0: number, x1: number): TowerState {
  const tower = createTower(1);
  setStructure(tower.grid, 1, x0, x1, 'lobby');
  tower.grid.mainLobbyHeight = 1;
  tower.stars = 6;
  return tower;
}

/** Lobby across the whole site, floors 2 to 101 and basements S1 to S9 under it. */
function fullSiteTower(): TowerState {
  const plan = plainTowerPlan(100, 0, 374);
  plan.floors = [
    ...(plan.floors ?? []),
    { from: 101, to: 101, x0: 0, x1: 374 },
    { from: -9, to: -1, x0: 0, x1: 374 },
  ];
  const { state } = buildTower(plan);
  state.money = 99_999_999;
  state.stars = 6;
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

function price(unitType: UnitType): number {
  const cost = UNIT_CATALOG[unitType].cost;
  if (cost.kind !== 'per-unit') throw new Error(`${unitType} has no unit price`);
  return cost.amount;
}

const ONE_OF_EACH: readonly [UnitType, number, Level][] = [
  ['office', 0, 2],
  ['condo', 10, 2],
  ['fast-food', 30, 2],
  ['single-room', 50, 2],
  ['double-room', 60, 2],
  ['suite', 70, 2],
  ['housekeeping', 90, 2],
  ['security', 110, 2],
  ['restaurant', 130, 2],
  ['retail-shop', 160, 2],
  ['medical-center', 180, 2],
  ['cinema', 210, 2],
  ['party-hall', 250, 2],
  ['parking-ramp', 0, -1],
  ['parking-space', 20, -1],
  ['recycling-center', 0, -3],
  ['subway-station', 0, -9],
  ['cathedral', 0, 101],
];

describe('buildUnit', () => {
  it.each(ONE_OF_EACH)('places a %s at column %i on level %i', (unitType, x, level) => {
    const { state, result } = run(fullSiteTower(), unit(unitType, x, level));
    expect(result).toEqual({ id: 'c1', ok: true, step: 0, cost: price(unitType), refund: 0 });
    const [placed] = Object.values(state.units);
    expect(placed).toMatchObject({ type: unitType, x, level });
  });

  it('places one of each catalog unit in the same tower', () => {
    let state = fullSiteTower();
    let spent = 0;
    for (const [unitType, x, level] of ONE_OF_EACH) {
      const outcome = run(state, unit(unitType, x, level));
      expect(outcome.result.ok).toBe(true);
      state = outcome.state;
      spent += price(unitType);
    }
    expect(Object.keys(state.units)).toHaveLength(18);
    expect(state.money).toBe(99_999_999 - spent);
  });

  it('adds floor under an office and charges $44,500', () => {
    const tower = towerWithMainLobby(0, 20);
    const { state, result } = run(tower, unit('office', 0, 2));
    expect(result.ok && result.cost).toBe(44_500);
    expect(state.money).toBe(tower.money - 44_500);
    expect(state.grid.levels[2]?.structure).toEqual([{ kind: 'floor', x0: 0, x1: 8 }]);
    expect(occupantAt(state.grid, 2, 8)).toEqual({ kind: 'unit', id: 'u1' });
  });

  it('charges floor only for bottom-row cells that lack it', () => {
    const tower = towerWithMainLobby(0, 40);
    setStructure(tower.grid, 2, 0, 19, 'floor');
    const { state, result } = run(tower, unit('cinema', 0, 2));
    expect(result.ok && result.cost).toBe(500_000 + 11 * 500);
    expect(structureAt(state.grid, 3, 5)).toBeNull();
    expect(occupantAt(state.grid, 3, 30)).toEqual({ kind: 'unit', id: 'u1' });
  });

  it('hangs a basement unit from the lobby and floors its bottom row', () => {
    const { state, result } = run(towerWithMainLobby(0, 20), unit('fast-food', 0, -1));
    expect(result.ok && result.cost).toBe(100_000 + 16 * 500);
    expect(structureAt(state.grid, -1, 15)).toBe('floor');
  });

  it('lets a unit rest on the top row of another unit', () => {
    const tower = towerWithMainLobby(0, 40);
    const cinema = run(tower, unit('cinema', 0, 2)).state;
    const { result } = run(cinema, unit('office', 0, 4));
    expect(result.ok && result.cost).toBe(44_500);
  });

  it('records the unit for rent at normal price with what was paid and when', () => {
    const tower = towerWithMainLobby(0, 20);
    tower.step = 500;
    const { state } = run(tower, unit('office', 3, 2));
    expect(state.units.u1).toEqual({
      id: 'u1',
      type: 'office',
      x: 3,
      level: 2,
      name: null,
      priceLevel: 'normal',
      paid: 44_500,
      placedAtStep: 500,
      used: false,
      lease: null,
      sale: null,
      hotel: null,
      evaluation: null,
      venue: null,
    });
    expect(state.nextId).toBe(2);
  });

  it('accepts a balance that exactly covers the cost', () => {
    const tower = fullSiteTower();
    tower.money = 40_000;
    const { state, result } = run(tower, unit('office', 0, 2));
    expect(result.ok).toBe(true);
    expect(state.money).toBe(0);
  });

  describe('rejections leave the tower unchanged', () => {
    it.each([
      ['a structure type', unit('lobby', 0, 2)],
      ['a transport type', unit('stairs', 0, 2)],
      ['an unknown type', unit('castle', 0, 2)],
      ['a fractional column', unit('office', 1.5, 2)],
      ['a missing level', unit('office', 0, Number.NaN)],
    ])('INVALID_COMMAND for %s', (_label, command) => {
      expect(rejection(fullSiteTower(), command)).toBe('INVALID_COMMAND');
    });

    it('CELL_OCCUPIED when overlapping another unit', () => {
      const tower = run(fullSiteTower(), unit('office', 0, 2)).state;
      expect(rejection(tower, unit('office', 8, 2))).toBe('CELL_OCCUPIED');
    });

    it('CELL_OCCUPIED over lobby', () => {
      const tower = fullSiteTower();
      tower.grid.mainLobbyHeight = 2;
      setStructure(tower.grid, 2, 0, 4, 'lobby');
      expect(rejection(tower, unit('office', 0, 2))).toBe('CELL_OCCUPIED');
    });

    it('CELL_OCCUPIED when an upper row is taken', () => {
      const tower = run(fullSiteTower(), unit('office', 20, 3)).state;
      expect(rejection(tower, unit('cinema', 0, 2))).toBe('CELL_OCCUPIED');
    });

    it('NO_SUPPORT above ground and in a basement', () => {
      const tower = towerWithMainLobby(0, 20);
      expect(rejection(tower, unit('office', 0, 3))).toBe('NO_SUPPORT');
      expect(rejection(tower, unit('office', 15, 2))).toBe('NO_SUPPORT');
      expect(rejection(tower, unit('fast-food', 0, -2))).toBe('NO_SUPPORT');
    });

    it.each([
      ['SPANS_GROUND', unit('cinema', 0, -1)],
      ['LOBBY_LEVEL_ONLY', unit('office', 0, 1)],
      ['LOBBY_LEVEL_ONLY', unit('fast-food', 0, 1)],
      ['ABOVE_GROUND_ONLY', unit('office', 0, -1)],
      ['ABOVE_GROUND_ONLY', unit('condo', 0, 101)],
      ['BASEMENT_ONLY', unit('parking-ramp', 0, 2)],
      ['SUBWAY_POSITION', unit('subway-station', 0, 5)],
      ['SUBWAY_POSITION', unit('subway-station', 0, -1)],
      ['SUBWAY_POSITION', unit('subway-station', 0, -5)],
      ['SUBWAY_POSITION', unit('subway-station', 0, -8)],
      ['CATHEDRAL_LEVEL_ONLY', unit('restaurant', 0, 101)],
      ['CATHEDRAL_LEVEL_ONLY', unit('cinema', 0, 100)],
      ['CATHEDRAL_POSITION', unit('cathedral', 0, 50)],
      ['LEVEL_RESERVED', unit('parking-space', 0, -10)],
      ['OUT_OF_BOUNDS', unit('office', 370, 2)],
      ['OUT_OF_BOUNDS', unit('office', 0, 105)],
      ['OUT_OF_BOUNDS', unit('cathedral', 0, 102)],
    ])('%s', (code, command) => {
      expect(rejection(fullSiteTower(), command)).toBe(code);
    });

    it('NEGATIVE_BALANCE when the balance is below zero', () => {
      const tower = fullSiteTower();
      tower.money = -1;
      expect(rejection(tower, unit('office', 0, 2))).toBe('NEGATIVE_BALANCE');
    });

    it('INSUFFICIENT_FUNDS when the balance is below the cost', () => {
      const tower = fullSiteTower();
      tower.money = 39_999;
      expect(rejection(tower, unit('office', 0, 2))).toBe('INSUFFICIENT_FUNDS');
    });

    it('INSUFFICIENT_FUNDS when the automatic floor tips the cost over', () => {
      const tower = towerWithMainLobby(0, 20);
      tower.money = 44_499;
      expect(rejection(tower, unit('office', 0, 2))).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('check order', () => {
    it('reports a negative balance before anything about the spot', () => {
      const tower = towerWithMainLobby(0, 20);
      tower.money = -1;
      expect(rejection(tower, unit('office', 0, 1))).toBe('NEGATIVE_BALANCE');
    });

    it('reports the zone before an occupied cell', () => {
      const tower = towerWithMainLobby(0, 20);
      expect(rejection(tower, unit('office', 0, 1))).toBe('LOBBY_LEVEL_ONLY');
    });

    it('reports an occupied cell before missing support', () => {
      const tower = run(fullSiteTower(), unit('office', 0, 50)).state;
      clearStructure(tower.grid, 49, 0, 374);
      expect(rejection(tower, unit('office', 4, 50))).toBe('CELL_OCCUPIED');
    });

    it('reports missing support before missing money', () => {
      const tower = towerWithMainLobby(0, 20);
      tower.money = 0;
      expect(rejection(tower, unit('office', 0, 3))).toBe('NO_SUPPORT');
    });

    it('reports the zone before missing money', () => {
      const tower = fullSiteTower();
      tower.money = 10;
      expect(rejection(tower, unit('office', 0, -1))).toBe('ABOVE_GROUND_ONLY');
    });
  });
});
