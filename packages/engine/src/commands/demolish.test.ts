import { MONEY_CAP, UNIT_CATALOG, type Command, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { occupantAt, structureAt } from '../grid';
import { addPeopleForUnit, listPeople } from '../people';
import { accept, fullSiteTower, rejection, run } from './shaft-test-helpers';

const REFUND_WINDOW = 360;

function towerReadyToBuild(shafts: Parameters<typeof fullSiteTower>[0] = []): TowerState {
  const tower = fullSiteTower(shafts);
  tower.stars = 6;
  return tower;
}

function build(tower: TowerState, unitType: string, x: number, level: number) {
  const command = { type: 'buildUnit', unitType, x, level } as Command;
  const { state } = accept(tower, command);
  const id = Object.keys(state.units).at(-1) as string;
  return { state, id };
}

function demolishUnit(id: string): Command {
  return { type: 'demolish', target: { kind: 'unit', id } };
}

function later(tower: TowerState, steps: number): TowerState {
  return { ...tower, step: tower.step + steps };
}

function priceOf(type: 'stairs' | 'floor'): number {
  const cost = UNIT_CATALOG[type].cost;
  return cost.kind === 'per-unit' || cost.kind === 'per-cell' ? cost.amount : 0;
}

function withStairs(tower: TowerState) {
  const command: Command = { type: 'buildTransport', transportType: 'stairs', x: 60, level: 5 };
  const { state } = accept(tower, command);
  const id = Object.keys(state.transports).at(-1) as string;
  return { state, id };
}

function demolishTransport(id: string): Command {
  return { type: 'demolish', target: { kind: 'transport', id } };
}

/** The lowest buildable basement, emptied so new floor can hang from the full -8 row. */
const NEW_FLOOR_LEVEL = -9;

function towerWithEmptyBasement(): TowerState {
  return accept(towerReadyToBuild(), demolishFloor(0, 374)).state;
}

function withNewFloor(tower: TowerState, x0: number, x1: number): TowerState {
  return accept(tower, { type: 'buildFloor', level: NEW_FLOOR_LEVEL, x0, x1 }).state;
}

function demolishFloor(x0: number, x1: number): Command {
  return { type: 'demolish', target: { kind: 'floor', level: NEW_FLOOR_LEVEL, x0, x1 } };
}

describe('demolish', () => {
  it('refunds the full paid amount 359 steps after placement', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const paid = state.units[id]?.paid as number;
    const before = later(state, REFUND_WINDOW - 1);

    const { state: after, result } = run(before, demolishUnit(id));

    expect(result).toMatchObject({ ok: true, cost: 0, refund: paid });
    expect(after.money).toBe(before.money + paid);
    expect(after.ledger.currentWeek.construction.income).toBe(paid);
  });

  it('refunds nothing at 360 steps or after the unit was used', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);

    const atLimit = run(later(state, REFUND_WINDOW), demolishUnit(id));
    expect(atLimit.result).toMatchObject({ ok: true, refund: 0 });
    expect(atLimit.state.money).toBe(state.money);

    const leased = structuredClone(state);
    (leased.units[id] as { used: boolean }).used = true;
    const afterUse = run(leased, demolishUnit(id));
    expect(afterUse.result).toMatchObject({ ok: true, refund: 0 });
    expect(afterUse.state.money).toBe(state.money);
  });

  it('caps the refund at $99,999,999', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const nearCap = { ...state, money: MONEY_CAP - 100 };

    const { state: after } = run(nearCap, demolishUnit(id));

    expect(after.money).toBe(MONEY_CAP);
  });

  it('charges the sale price of a sold condo, even into negative balance', () => {
    const { state, id } = build(towerReadyToBuild(), 'condo', 10, 5);
    const sold = structuredClone(state);
    const condo = sold.units[id] as TowerState['units'][string];
    condo.used = true;
    condo.sale = { price: 80_000, anchorStep: 0, nextEvaluationStep: 100_000 };
    sold.money = 5_000;

    const { state: after, result } = run(sold, demolishUnit(id));

    expect(result.ok).toBe(true);
    expect(after.money).toBe(5_000 - 80_000);
    expect(after.ledger.currentWeek.condoBuybacks.expense).toBe(-80_000);
  });

  it('ends the lease and removes people homed or working in the unit', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const leased = structuredClone(state);
    const office = leased.units[id] as TowerState['units'][string];
    office.used = true;
    office.lease = { anchorStep: 0, nextDueStep: 100, weekVisits: 0 };
    addPeopleForUnit(leased, id);
    expect(listPeople(leased.people).length).toBeGreaterThan(0);

    const { state: after } = run(leased, demolishUnit(id));

    expect(after.units[id]).toBeUndefined();
    expect(listPeople(after.people)).toEqual([]);
  });

  it('removes the guards of a demolished security office', () => {
    const { state, id } = build(towerReadyToBuild(), 'security', 10, -1);
    const guarded = structuredClone(state);
    addPeopleForUnit(guarded, id);
    expect(listPeople(guarded.people).filter((p) => p.kind === 'guard')).not.toEqual([]);

    const { state: after } = run(guarded, demolishUnit(id));

    expect(listPeople(after.people)).toEqual([]);
  });

  it('rejects an empty cell with NOTHING_TO_DEMOLISH', () => {
    const tower = towerReadyToBuild();
    expect(rejection(tower, demolishUnit('u999'))).toBe('NOTHING_TO_DEMOLISH');
    const skyLobby: Command = {
      type: 'demolish',
      target: { kind: 'lobby', level: 15, x0: 5, x1: 8 },
    };
    expect(rejection(tower, skyLobby)).toBe('NOTHING_TO_DEMOLISH');
    const ruins: Command = { type: 'demolish', target: { kind: 'ruins', level: 20, x: 5 } };
    expect(rejection(tower, ruins)).toBe('NOTHING_TO_DEMOLISH');
  });

  it('rejects any main lobby cell with MAIN_LOBBY_PROTECTED', () => {
    const tower = towerReadyToBuild();
    const lobby: Command = {
      type: 'demolish',
      target: { kind: 'lobby', level: 1, x0: 100, x1: 100 },
    };
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 1, x0: 0, x1: 374 },
    };
    expect(rejection(tower, lobby)).toBe('MAIN_LOBBY_PROTECTED');
    expect(rejection(tower, floor)).toBe('MAIN_LOBBY_PROTECTED');
  });

  it('turns sky lobby columns into floor', () => {
    const built = accept(towerReadyToBuild(), {
      type: 'buildLobby',
      level: 15,
      x0: 100,
      x1: 105,
      height: 2,
    });
    expect(structureAt(built.state.grid, 16, 102)).toBe('lobby');

    const { state } = accept(built.state, {
      type: 'demolish',
      target: { kind: 'lobby', level: 15, x0: 102, x1: 103 },
    });

    expect(structureAt(state.grid, 15, 102)).toBe('floor');
    expect(structureAt(state.grid, 16, 103)).toBe('floor');
    expect(structureAt(state.grid, 15, 101)).toBe('lobby');
  });

  it('rejects floor under a unit with CELL_OCCUPIED', () => {
    const { state } = build(towerReadyToBuild(), 'office', 10, 5);
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 5, x0: 10, x1: 10 },
    };
    expect(rejection(state, floor)).toBe('CELL_OCCUPIED');
  });

  it('rejects floor under another floor, or a basement floor above another, with SUPPORTS_STRUCTURE', () => {
    const tower = towerReadyToBuild();
    const underFloor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 50, x0: 4, x1: 6 },
    };
    const basement: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: -5, x0: 4, x1: 6 },
    };
    expect(rejection(tower, underFloor)).toBe('SUPPORTS_STRUCTURE');
    expect(rejection(tower, basement)).toBe('SUPPORTS_STRUCTURE');

    const top: Command = { type: 'demolish', target: { kind: 'floor', level: 101, x0: 4, x1: 6 } };
    const lowestBasement: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: -9, x0: 4, x1: 6 },
    };
    expect(structureAt(accept(tower, top).state.grid, 101, 5)).toBeNull();
    expect(structureAt(accept(tower, lowestBasement).state.grid, -9, 5)).toBeNull();
  });

  it('rejects S1 ramp when S2 has a ramp with RAMP_POSITION', () => {
    const first = build(towerReadyToBuild(), 'parking-ramp', 20, -1);
    const second = build(first.state, 'parking-ramp', 20, -2);

    expect(rejection(second.state, demolishUnit(first.id))).toBe('RAMP_POSITION');
    const { state } = accept(second.state, demolishUnit(second.id));
    expect(state.units[second.id]).toBeUndefined();
  });

  it('rejects a shaft or car with riders with SHAFT_IN_USE', () => {
    const tower = towerReadyToBuild([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    accept(tower, { type: 'addCar', shaftId: 's1', homeLevel: 3 });
    const withCars = accept(tower, { type: 'addCar', shaftId: 's1', homeLevel: 3 }).state;
    const riding = structuredClone(withCars);
    riding.shafts.s1?.cars[0]?.riders.push('p1');

    expect(rejection(riding, { type: 'demolish', target: { kind: 'shaft', id: 's1' } })).toBe(
      'SHAFT_IN_USE',
    );
    expect(rejection(riding, { type: 'removeCar', shaftId: 's1', carIndex: 0 })).toBe(
      'SHAFT_IN_USE',
    );
  });

  it('rejects removing the last car with LAST_CAR', () => {
    const tower = towerReadyToBuild([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    expect(rejection(tower, { type: 'removeCar', shaftId: 's1', carIndex: 0 })).toBe('LAST_CAR');
  });

  it('leaves no grid cell, unit, shaft or person pointing at a removed id', () => {
    const tower = towerReadyToBuild([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
    const withUnit = build(tower, 'office', 10, 5);
    const withStairs = accept(withUnit.state, {
      type: 'buildTransport',
      transportType: 'stairs',
      x: 60,
      level: 5,
    }).state;
    addPeopleForUnit(withStairs, withUnit.id);
    const stairsId = Object.keys(withStairs.transports)[0] as string;

    let state = accept(withStairs, demolishUnit(withUnit.id)).state;
    state = accept(state, { type: 'demolish', target: { kind: 'transport', id: stairsId } }).state;
    state = accept(state, { type: 'demolish', target: { kind: 'shaft', id: 's1' } }).state;

    for (const row of Object.values(state.grid.levels)) {
      for (const span of row?.occupants ?? []) expect(span.occupant.kind).toBe('ruins');
    }
    expect(occupantAt(state.grid, 5, 10)).toBeNull();
    expect(structureAt(state.grid, 5, 10)).toBe('floor');
    expect(Object.keys(state.units)).toEqual([]);
    expect(Object.keys(state.transports)).toEqual([]);
    expect(Object.keys(state.shafts)).toEqual([]);
    expect(listPeople(state.people)).toEqual([]);
  });
});

describe('demolish refund for stairs and floor', () => {
  it('refunds stairs in full 359 steps after placement and nothing at 360', () => {
    const { state, id } = withStairs(towerReadyToBuild());
    expect(state.transports[id]).toMatchObject({
      paid: priceOf('stairs'),
      placedAtStep: state.step,
    });

    const young = later(state, REFUND_WINDOW - 1);
    const { state: refunded, result } = run(young, demolishTransport(id));
    expect(result).toMatchObject({ ok: true, cost: 0, refund: priceOf('stairs') });
    expect(refunded.money).toBe(young.money + priceOf('stairs'));
    expect(refunded.ledger.currentWeek.construction.income).toBe(priceOf('stairs'));

    const old = later(state, REFUND_WINDOW);
    const { state: kept, result: late } = run(old, demolishTransport(id));
    expect(late).toMatchObject({ ok: true, refund: 0 });
    expect(kept.money).toBe(old.money);
  });

  it('refunds an escalator in full 359 steps after placement and nothing at 360', () => {
    const command: Command = {
      type: 'buildTransport',
      transportType: 'escalator',
      x: 60,
      level: 5,
    };
    const { state } = accept(towerReadyToBuild(), command);
    const id = Object.keys(state.transports).at(-1) as string;
    const paid = state.transports[id]?.paid ?? 0;
    expect(paid).toBeGreaterThan(0);

    const young = later(state, REFUND_WINDOW - 1);
    const { state: refunded, result } = run(young, demolishTransport(id));
    expect(result).toMatchObject({ ok: true, refund: paid });
    expect(refunded.money).toBe(young.money + paid);

    const old = later(state, REFUND_WINDOW);
    const { state: kept, result: late } = run(old, demolishTransport(id));
    expect(late).toMatchObject({ ok: true, refund: 0 });
    expect(kept.money).toBe(old.money);
  });

  it('refunds floor tool cells in full 359 steps after placement and nothing at 360', () => {
    const state = withNewFloor(towerWithEmptyBasement(), 4, 9);
    const paid = 6 * priceOf('floor');

    const young = later(state, REFUND_WINDOW - 1);
    const { state: refunded, result } = run(young, demolishFloor(4, 9));
    expect(result).toMatchObject({ ok: true, cost: 0, refund: paid });
    expect(refunded.money).toBe(young.money + paid);
    expect(refunded.ledger.currentWeek.construction.income).toBe(paid);
    expect(refunded.floorPurchases).toEqual([]);

    const old = later(state, REFUND_WINDOW);
    const { state: kept, result: late } = run(old, demolishFloor(4, 9));
    expect(late).toMatchObject({ ok: true, refund: 0 });
    expect(kept.money).toBe(old.money);
  });

  it('refunds each floor cell once when a purchase is demolished in parts', () => {
    const state = withNewFloor(towerWithEmptyBasement(), 4, 9);

    const first = run(state, demolishFloor(4, 5));
    expect(first.result).toMatchObject({ ok: true, refund: 2 * priceOf('floor') });
    const second = run(first.state, demolishFloor(0, 20));
    expect(second.result).toMatchObject({ ok: true, refund: 4 * priceOf('floor') });
    const rebuiltAndOld = later(withNewFloor(second.state, 4, 4), REFUND_WINDOW);
    expect(run(rebuiltAndOld, demolishFloor(4, 4)).result).toMatchObject({ refund: 0 });
  });

  it('caps stairs and floor refunds at $99,999,999', () => {
    const stairs = withStairs(towerReadyToBuild());
    const stairsNearCap = { ...stairs.state, money: MONEY_CAP - 100 };
    expect(run(stairsNearCap, demolishTransport(stairs.id)).state.money).toBe(MONEY_CAP);

    const floorNearCap = {
      ...withNewFloor(towerWithEmptyBasement(), 4, 9),
      money: MONEY_CAP - 100,
    };
    const { state, result } = run(floorNearCap, demolishFloor(4, 9));
    expect(state.money).toBe(MONEY_CAP);
    expect(result).toMatchObject({ refund: 100 });
  });

  it('leaves the automatic floor of a unit in the unit refund', () => {
    const { state, id } = build(towerWithEmptyBasement(), 'fast-food', 10, NEW_FLOOR_LEVEL);
    const width = UNIT_CATALOG['fast-food'].width;
    const paid = state.units[id]?.paid as number;
    expect(state.floorPurchases).toEqual([]);

    const afterUnit = run(state, demolishUnit(id));
    expect(afterUnit.result).toMatchObject({ refund: paid });
    const afterFloor = run(afterUnit.state, demolishFloor(10, 10 + width - 1));
    expect(afterFloor.result).toMatchObject({ ok: true, refund: 0 });
    expect(afterFloor.state.money).toBe(afterUnit.state.money);
  });

  it('keeps an office refund at what was paid for it', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const paid = state.units[id]?.paid as number;
    expect(run(state, demolishUnit(id)).result).toMatchObject({ refund: paid });
  });
});
