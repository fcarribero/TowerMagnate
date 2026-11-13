import type { QueuedCommand, TowerState, UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { clearStructure, occupantAt } from '../grid';
import { hashState } from '../hash';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';

function towerWith(units: { type: UnitType; level: number; x: number }[] = []): TowerState {
  const plan = plainTowerPlan(70, 0, 80);
  plan.floors = [...(plan.floors ?? []), { from: -3, to: -1, x0: 0, x1: 80 }];
  const { state } = buildTower({ ...plan, units });
  state.money = 10_000_000;
  state.stars = 6;
  return state;
}

function transport(transportType: string, x: number, level: number): QueuedCommand {
  return { id: 'c1', command: { type: 'buildTransport', transportType, x, level } as never };
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

describe('buildTransport stairs', () => {
  it('places stairs on 4 empty floor cells for $5,000', () => {
    const tower = towerWith();
    const { state, result } = run(tower, transport('stairs', 10, 2));
    expect(result).toEqual({ id: 'c1', ok: true, step: 0, cost: 5_000, refund: 0 });
    expect(state.money).toBe(tower.money - 5_000);
    expect(state.transports.t1).toEqual({
      id: 't1',
      type: 'stairs',
      x: 10,
      level: 2,
      paid: 5_000,
      placedAtStep: 0,
    });
  });

  it('puts the footprint on the lower level and reserves the landing above', () => {
    const { state } = run(towerWith(), transport('stairs', 10, 2));
    const footprint = { kind: 'transport', id: 't1', part: 'footprint' };
    const landing = { kind: 'transport', id: 't1', part: 'landing' };
    expect(occupantAt(state.grid, 2, 10)).toEqual(footprint);
    expect(occupantAt(state.grid, 2, 13)).toEqual(footprint);
    expect(occupantAt(state.grid, 2, 14)).toBeNull();
    expect(occupantAt(state.grid, 3, 10)).toEqual(landing);
    expect(occupantAt(state.grid, 3, 13)).toEqual(landing);
    expect(occupantAt(state.grid, 3, 9)).toBeNull();
  });

  it('places stairs on lobby cells linking S1 with floor 1', () => {
    const { result } = run(towerWith(), transport('stairs', 10, -1));
    expect(result.ok).toBe(true);
  });

  it('lets stairs stack in the same columns', () => {
    let tower = towerWith();
    for (const level of [2, 3, 4]) {
      const outcome = run(tower, transport('stairs', 10, level));
      expect(outcome.result.ok).toBe(true);
      tower = outcome.state;
    }
    expect(Object.keys(tower.transports)).toHaveLength(3);
    expect(occupantAt(tower.grid, 3, 12)).toMatchObject({ part: 'footprint' });
    expect(occupantAt(tower.grid, 5, 12)).toMatchObject({ part: 'landing' });
  });

  it('lets a staircase stand on the landing of another one placed with an offset', () => {
    const first = run(towerWith(), transport('stairs', 10, 2)).state;
    const { state, result } = run(first, transport('stairs', 12, 3));
    expect(result.ok).toBe(true);
    expect(occupantAt(state.grid, 3, 11)).toMatchObject({ id: 't1', part: 'landing' });
    expect(occupantAt(state.grid, 3, 12)).toMatchObject({ id: 't2', part: 'footprint' });
  });

  it('accepts stairs below an existing one when their footprints meet the landing', () => {
    const upper = run(towerWith(), transport('stairs', 10, 3)).state;
    const { state, result } = run(upper, transport('stairs', 10, 2));
    expect(result.ok).toBe(true);
    expect(occupantAt(state.grid, 3, 10)).toMatchObject({ id: 't1', part: 'footprint' });
  });

  it('rejects a footprint cell without structure as NO_FLOOR', () => {
    expect(rejection(towerWith(), transport('stairs', 78, 2))).toBe('NO_FLOOR');
  });

  it('places stairs over a unit: the unit stays in the back layer', () => {
    const tower = towerWith([{ type: 'office', level: 2, x: 12 }]);
    const { state, result } = run(tower, transport('stairs', 10, 2));
    expect(result.ok).toBe(true);
    expect(Object.keys(state.units)).toHaveLength(1);
    expect(occupantAt(state.grid, 2, 12)?.kind).toBe('unit');
    const spans = state.grid.levels[2]?.occupants ?? [];
    expect(spans.some(({ occupant }) => occupant.kind === 'transport')).toBe(true);
  });

  it('rejects stairs over a shaft as CELL_OCCUPIED', () => {
    const tower = towerWith();
    tower.money = 10_000_000;
    const built = run(tower, {
      id: 'c0',
      command: { type: 'buildShaft', shaftType: 'standard', x: 12, bottom: 1, top: 4 } as never,
    }).state;
    expect(rejection(built, transport('stairs', 10, 2))).toBe('CELL_OCCUPIED');
  });

  it('rejects a footprint on another footprint as CELL_OCCUPIED', () => {
    const tower = run(towerWith(), transport('stairs', 10, 2)).state;
    expect(rejection(tower, transport('stairs', 12, 2))).toBe('CELL_OCCUPIED');
  });

  it('rejects a missing landing floor as TRANSPORT_LANDING', () => {
    expect(rejection(towerWith(), transport('stairs', 10, 70))).toBe('TRANSPORT_LANDING');
  });

  it('rejects a landing cell without floor as TRANSPORT_LANDING', () => {
    const tower = towerWith();
    clearStructure(tower.grid, 3, 13, 80);
    expect(rejection(tower, transport('stairs', 10, 2))).toBe('TRANSPORT_LANDING');
  });

  it('lets the landing rest over a unit', () => {
    const tower = towerWith([{ type: 'office', level: 3, x: 12 }]);
    const { state, result } = run(tower, transport('stairs', 10, 2));
    expect(result.ok).toBe(true);
    expect(occupantAt(state.grid, 3, 12)?.kind).toBe('unit');
  });

  it('rejects the subway tunnel level and the top level', () => {
    expect(rejection(towerWith(), transport('stairs', 10, -10))).toBe('LEVEL_RESERVED');
    expect(rejection(towerWith(), transport('stairs', 10, 104))).toBe('OUT_OF_BOUNDS');
  });

  it('rejects stairs past the right edge of the site', () => {
    expect(rejection(towerWith(), transport('stairs', 372, 2))).toBe('OUT_OF_BOUNDS');
  });

  it('rejects an unknown transport type', () => {
    expect(rejection(towerWith(), transport('ramp', 10, 2))).toBe('INVALID_COMMAND');
  });

  it('rejects stairs the balance cannot pay for', () => {
    const tower = towerWith();
    tower.money = 4_999;
    expect(rejection(tower, transport('stairs', 10, 2))).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects any construction while the balance is negative', () => {
    const tower = towerWith();
    tower.money = -1;
    expect(rejection(tower, transport('stairs', 10, 2))).toBe('NEGATIVE_BALANCE');
  });
});

describe('buildTransport limit', () => {
  function stackedTower(count: number): TowerState {
    let tower = buildTower(plainTowerPlan(70, 0, 10)).state;
    tower.money = 10_000_000;
    for (let level = 2; level < 2 + count; level++) {
      tower = run(tower, transport('stairs', 0, level)).state;
    }
    return tower;
  }

  it('accepts the 64th and rejects the 65th as LIMIT_REACHED', () => {
    const tower = stackedTower(63);
    expect(Object.keys(tower.transports)).toHaveLength(63);
    const sixtyFourth = run(tower, transport('stairs', 0, 65));
    expect(sixtyFourth.result.ok).toBe(true);
    expect(rejection(sixtyFourth.state, transport('stairs', 0, 66))).toBe('LIMIT_REACHED');
    expect(rejection(sixtyFourth.state, transport('escalator', 20, 2))).toBe('LIMIT_REACHED');
  });
});

describe('buildTransport escalators', () => {
  it('places an escalator between two shop floors for $20,000', () => {
    const tower = towerWith([
      { type: 'retail-shop', level: 2, x: 40 },
      { type: 'fast-food', level: 3, x: 40 },
    ]);
    const { state, result } = run(tower, transport('escalator', 10, 2));
    expect(result).toEqual({ id: 'c1', ok: true, step: 0, cost: 20_000, refund: 0 });
    expect(Object.values(state.transports)).toMatchObject([{ type: 'escalator', x: 10, level: 2 }]);
  });

  it('places an escalator between empty floors', () => {
    expect(run(towerWith(), transport('escalator', 10, 2)).result.ok).toBe(true);
  });

  it('places an escalator between the lobby and a shop floor', () => {
    const tower = towerWith([{ type: 'single-room', level: 2, x: 40 }]);
    expect(run(tower, transport('escalator', 10, 1)).result.ok).toBe(true);
  });

  it('rejects an escalator between a shop floor and an office floor', () => {
    const tower = towerWith([
      { type: 'retail-shop', level: 2, x: 40 },
      { type: 'office', level: 3, x: 40 },
    ]);
    expect(rejection(tower, transport('escalator', 10, 2))).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('rejects an escalator when the lower level has an office', () => {
    const tower = towerWith([{ type: 'office', level: 2, x: 40 }]);
    expect(rejection(tower, transport('escalator', 10, 2))).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('counts a tall unit on each of its levels', () => {
    const tower = towerWith([{ type: 'medical-center', level: 3, x: 40 }]);
    expect(rejection(tower, transport('escalator', 10, 2))).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('still lets stairs go between a shop floor and an office floor', () => {
    const tower = towerWith([
      { type: 'retail-shop', level: 2, x: 40 },
      { type: 'office', level: 3, x: 40 },
    ]);
    expect(run(tower, transport('stairs', 10, 2)).result.ok).toBe(true);
  });
});

describe('buildUnit on escalator levels', () => {
  const escalatorTower = () => run(towerWith(), transport('escalator', 10, 2)).state;

  it('rejects an office on either level of an escalator as ESCALATOR_FLOOR_TYPE', () => {
    expect(rejection(escalatorTower(), unit('office', 40, 2))).toBe('ESCALATOR_FLOOR_TYPE');
    expect(rejection(escalatorTower(), unit('office', 40, 3))).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('rejects a tall unit that reaches an escalator level', () => {
    expect(rejection(escalatorTower(), unit('medical-center', 40, 3))).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('accepts a shop on an escalator level and an office on other levels', () => {
    expect(run(escalatorTower(), unit('retail-shop', 40, 2)).result.ok).toBe(true);
    expect(run(escalatorTower(), unit('office', 40, 4)).result.ok).toBe(true);
  });

  it('lets an office go next to stairs', () => {
    const tower = run(towerWith(), transport('stairs', 10, 2)).state;
    expect(run(tower, unit('office', 40, 2)).result.ok).toBe(true);
  });

  it('rejects a unit on a transport footprint as CELL_OCCUPIED before the escalator rule', () => {
    expect(rejection(escalatorTower(), unit('office', 10, 2))).toBe('CELL_OCCUPIED');
  });
});
