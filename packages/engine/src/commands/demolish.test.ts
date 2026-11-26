import { type Command, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { demolitionIndemnity } from './demolish';
import { occupantAt, structureAt } from '../grid';
import { addPeopleForUnit, listPeople } from '../people';
import { step } from '../step';
import { buildTower } from '../testing';
import { accept, fullSiteTower, rejection, run } from './shaft-test-helpers';

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
  it('pays nothing back for a unit, however new or unused it is', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);

    const { state: after, result } = run(state, demolishUnit(id));

    expect(result).toMatchObject({ ok: true, cost: 0, refund: 0 });
    expect(after.money).toBe(state.money);
    expect(after.ledger.currentWeek.construction.income).toBe(0);
  });

  it('refuses a condo that has owners', () => {
    const { state, id } = build(towerReadyToBuild(), 'condo', 10, 5);
    const sold = structuredClone(state);
    const condo = sold.units[id] as TowerState['units'][string];
    condo.used = true;
    condo.sale = { price: 80_000, anchorStep: 0, nextEvaluationStep: 100_000 };

    expect(rejection(sold, demolishUnit(id))).toBe('CONDO_OWNED');
  });

  describe('buyBackCondo', () => {
    function soldCondo(money: number) {
      const { state, id } = build(towerReadyToBuild(), 'condo', 10, 5);
      const sold = structuredClone(state);
      const condo = sold.units[id] as TowerState['units'][string];
      condo.used = true;
      condo.listed = true;
      condo.appraisal = 120_000;
      condo.sale = { price: 80_000, anchorStep: 0, nextEvaluationStep: 100_000 };
      addPeopleForUnit(sold, id);
      sold.money = money;
      return { sold, id };
    }

    it('pays the appraisal, empties the condo at once and takes it off the market', () => {
      const { sold, id } = soldCondo(500_000);
      expect(listPeople(sold.people).length).toBeGreaterThan(0);

      const { state: after, result } = run(sold, {
        type: 'buyBackCondo',
        unitId: id,
        price: 120_000,
      });

      expect(result.ok).toBe(true);
      expect(after.money).toBe(500_000 - 120_000);
      expect(after.ledger.currentWeek.condoBuybacks.expense).toBe(-120_000);
      expect(after.units[id]).toMatchObject({ sale: null, listed: false, price: 120_000 });
      expect(listPeople(after.people)).toEqual([]);
      expect(accept(after, demolishUnit(id)).state.units[id]).toBeUndefined();
    });

    it('refuses when the appraisal changed from the price the player agreed to', () => {
      const { sold, id } = soldCondo(500_000);
      expect(rejection(sold, { type: 'buyBackCondo', unitId: id, price: 110_000 })).toBe(
        'PRICE_CHANGED',
      );
    });

    it('refuses when the money does not cover the appraisal', () => {
      const { sold, id } = soldCondo(50_000);
      expect(rejection(sold, { type: 'buyBackCondo', unitId: id, price: 120_000 })).toBe(
        'INSUFFICIENT_FUNDS',
      );
    });
  });

  it('ends the lease and removes people homed or working in the unit', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const leased = structuredClone(state);
    const office = leased.units[id] as TowerState['units'][string];
    office.used = true;
    office.lease = { anchorStep: 0, nextDueStep: 100, weekVisits: 0, rent: 10_000 };
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
    expect(listPeople(guarded.people).filter((p) => p.kind === 'police')).not.toEqual([]);

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

  it('rejects a main lobby cell inside its run and any floor tool over it', () => {
    const tower = towerReadyToBuild();
    const lobby: Command = {
      type: 'demolish',
      target: { kind: 'lobby', level: 1, x0: 100, x1: 100 },
    };
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 1, x0: 0, x1: 374 },
    };
    expect(rejection(tower, lobby)).toBe('MAIN_LOBBY_INNER');
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

  it('demolishes only the units of a floor run that covers them and leaves the floor', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 5, x0: 4, x1: 12 },
    };
    const { state: after } = run(state, floor);
    expect(after.units[id]).toBeUndefined();
    expect(occupantAt(after.grid, 5, 10)).toBeNull();
    for (const x of [4, 8, 10, 12]) expect(structureAt(after.grid, 5, x)).toBe('floor');
  });

  it('demolishes the walls of a span that has no unit', () => {
    const tower = withNewFloor(towerWithEmptyBasement(), 40, 50);
    expect(structureAt(tower.grid, NEW_FLOOR_LEVEL, 45)).toBe('floor');
    const { state: after } = run(tower, demolishFloor(44, 46));
    expect(structureAt(after.grid, NEW_FLOOR_LEVEL, 45)).toBeNull();
    expect(structureAt(after.grid, NEW_FLOOR_LEVEL, 43)).toBe('floor');
  });

  it('charges one week of rent per rented unit of a floor run and nothing for the others', () => {
    const first = build(towerReadyToBuild(), 'office', 10, 5);
    const second = build(first.state, 'office', 30, 5);
    const leased = structuredClone(second.state);
    (leased.units[first.id] as TowerState['units'][string]).lease = {
      anchorStep: 0,
      nextDueStep: 100,
      weekVisits: 0,
      rent: 12_000,
    };
    leased.money = 100_000;
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 5, x0: 0, x1: 60 },
    };
    const { state: after } = run(leased, floor);
    expect(Object.keys(after.units)).not.toContain(first.id);
    expect(Object.keys(after.units)).not.toContain(second.id);
    expect(after.ledger.currentWeek.rent.expense).toBe(-12_000);
    expect(structureAt(after.grid, 5, 10)).toBe('floor');
    expect(structureAt(after.grid, 5, 50)).toBe('floor');
  });

  it('still rejects a floor run that also covers a stairway with CELL_OCCUPIED', () => {
    const { state: withUnit } = build(towerReadyToBuild(), 'office', 52, 5);
    const { state } = withStairs(withUnit);
    const floor: Command = {
      type: 'demolish',
      target: { kind: 'floor', level: 5, x0: 52, x1: 62 },
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

  it('demolishes any ramp, leaving the ones below it without access', () => {
    const first = build(towerReadyToBuild(), 'parking-ramp', 20, -1);
    const second = build(first.state, 'parking-ramp', 20, -2);

    const { state } = accept(second.state, demolishUnit(first.id));
    expect(state.units[first.id]).toBeUndefined();
    expect(state.units[second.id]).toBeDefined();
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

describe('demolish pays nothing back', () => {
  function withSkyLobby(tower: TowerState): TowerState {
    const command: Command = { type: 'buildLobby', level: 15, x0: 100, x1: 103, height: 2 };
    return accept(tower, command).state;
  }

  it('for stairs, floor tool cells and a sky lobby, right after building them', () => {
    const stairs = withStairs(towerReadyToBuild());
    const afterStairs = run(stairs.state, demolishTransport(stairs.id));
    expect(afterStairs.result).toMatchObject({ ok: true, refund: 0 });
    expect(afterStairs.state.money).toBe(stairs.state.money);

    const floor = withNewFloor(towerWithEmptyBasement(), 4, 9);
    const afterFloor = run(floor, demolishFloor(4, 9));
    expect(afterFloor.result).toMatchObject({ ok: true, refund: 0 });
    expect(afterFloor.state.money).toBe(floor.money);

    const lobby = withSkyLobby(towerReadyToBuild());
    const lobbyCommand: Command = {
      type: 'demolish',
      target: { kind: 'lobby', level: 15, x0: 100, x1: 103 },
    };
    const afterLobby = run(lobby, lobbyCommand);
    expect(afterLobby.result).toMatchObject({ ok: true, refund: 0 });
    expect(afterLobby.state.money).toBe(lobby.money);
    expect(structureAt(afterLobby.state.grid, 15, 100)).toBe('floor');
  });
});

describe('demolish main lobby', () => {
  function mainLobby(level: number, x0: number, x1: number): Command {
    return { type: 'demolish', target: { kind: 'lobby', level: level as 1, x0, x1 } };
  }

  function lobbyOnly() {
    const { state } = buildTower({ lobby: { x0: 0, x1: 19 } });
    return state;
  }

  it('removes columns from either end and leaves empty ground', () => {
    const left = accept(lobbyOnly(), mainLobby(1, 0, 4)).state;
    expect(structureAt(left.grid, 1, 0)).toBeNull();
    expect(structureAt(left.grid, 1, 4)).toBeNull();
    expect(structureAt(left.grid, 1, 5)).toBe('lobby');
    const both = accept(left, mainLobby(1, 15, 19)).state;
    expect(structureAt(both.grid, 1, 19)).toBeNull();
    expect(structureAt(both.grid, 1, 10)).toBe('lobby');
  });

  it('lets the whole lobby go when nothing stands above it', () => {
    const { state } = run(lobbyOnly(), mainLobby(1, 0, 19));
    expect(state.grid.mainLobbyHeight).toBeNull();
    expect(structureAt(state.grid, 1, 10)).toBeNull();
  });

  it('rejects a part that does not touch an end or would split the lobby', () => {
    expect(rejection(lobbyOnly(), mainLobby(1, 8, 9))).toBe('MAIN_LOBBY_INNER');
    expect(rejection(lobbyOnly(), mainLobby(1, 1, 3))).toBe('MAIN_LOBBY_INNER');
  });

  it('rejects columns with structure on any level above', () => {
    const { state } = buildTower({
      lobby: { x0: 0, x1: 19 },
      floors: [{ from: 5, to: 5, x0: 2, x1: 3 }],
    });
    expect(rejection(state, mainLobby(1, 0, 4))).toBe('MAIN_LOBBY_COVERED');
    expect(run(state, mainLobby(1, 4, 19)).result.ok).toBe(true);
  });
});

describe('demolish indemnity', () => {
  it('charges the locked weekly rent of a rented office', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    const leased = structuredClone(state);
    const office = leased.units[id] as TowerState['units'][string];
    office.lease = { anchorStep: 0, nextDueStep: 100, weekVisits: 0, rent: 12_000 };
    leased.money = 100_000;
    const { state: after } = run(leased, demolishUnit(id));
    expect(demolitionIndemnity(leased, [id])).toBe(12_000);
    expect(after.ledger.currentWeek.rent.expense).toBe(-12_000);
  });

  it('charges nothing for an unrented unit and sums a row of rented ones', () => {
    const { state, id } = build(towerReadyToBuild(), 'office', 10, 5);
    expect(demolitionIndemnity(state, [id])).toBe(0);
    const other = structuredClone(state);
    const first = other.units[id] as TowerState['units'][string];
    first.lease = { anchorStep: 0, nextDueStep: 100, weekVisits: 0, rent: 7_000 };
    other.units.u90 = {
      ...first,
      id: 'u90',
      lease: { ...(first.lease as object), rent: 5_000 } as never,
    };
    expect(demolitionIndemnity(other, [id, 'u90', id, 'u999'])).toBe(12_000);
  });
});

describe('demolishing a construction site', () => {
  /** Like `run`, but the site stays a site: no crew finishes it. */
  function runUnfinished(tower: TowerState, command: Command) {
    const { state, results } = step(tower, [{ id: 'c1', command }], 0);
    return { state, result: results[0] };
  }

  function placed() {
    const tower = towerReadyToBuild();
    const before = tower.money;
    const { state } = runUnfinished(tower, {
      type: 'buildUnit',
      unitType: 'office',
      x: 100,
      level: 5,
    });
    const siteId = Object.keys(state.sites).at(-1) as string;
    return { before, state, siteId };
  }

  it('pays the whole cost back while no work has started', () => {
    const { before, state: built, siteId } = placed();
    const paid = built.sites[siteId]?.paid ?? 0;
    expect(paid).toBeGreaterThan(0);

    const { state, result } = runUnfinished(built, demolishUnit(siteId));
    expect(result).toMatchObject({ ok: true, refund: paid });
    expect(state.sites[siteId]).toBeUndefined();
    expect(state.money).toBe(before);
  });

  it('pays nothing back once work has started', () => {
    const { state: built, siteId } = placed();
    const started = structuredClone(built);
    (started.sites[siteId] as { points: number }).points = 1;

    const { state, result } = runUnfinished(started, demolishUnit(siteId));
    expect(result).toMatchObject({ ok: true, refund: 0 });
    expect(state.money).toBe(started.money);
  });
});
