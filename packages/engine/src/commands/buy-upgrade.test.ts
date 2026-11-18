import { upgradePrice, type QueuedCommand, type TowerState, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { buildTower, plainTowerPlan } from '../testing';

function towerWith(type: 'security' | 'office'): { tower: TowerState; unitId: UnitId } {
  const plan = { ...plainTowerPlan(3, 0, 40), units: [{ type, x: 0, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  state.money = 10_000_000;
  return { tower: state, unitId: unitIds[0] as UnitId };
}

function buy(unitId: string, upgradeId: string, id = 'c1'): QueuedCommand {
  return { id, command: { type: 'buyUpgrade', unitId, upgradeId } };
}

describe('buyUpgrade', () => {
  it('prices a level at a quarter of the unit price times the level', () => {
    expect(upgradePrice('security', 0)).toBe(25_000);
    expect(upgradePrice('security', 1)).toBe(50_000);
    expect(upgradePrice('security', 2)).toBe(75_000);
  });

  it('charges the price and raises the level by one', () => {
    const { tower, unitId } = towerWith('security');
    const first = step(tower, [buy(unitId, 'cameras')], 0);
    expect(first.results).toEqual([{ id: 'c1', ok: true, step: 0, cost: 25_000, refund: 0 }]);
    expect(first.state.units[unitId]?.upgrades).toEqual({ cameras: 1 });
    expect(first.state.money).toBe(tower.money - 25_000);
    const second = step(first.state, [buy(unitId, 'cameras'), buy(unitId, 'guards', 'c2')], 0);
    expect(second.results.map((result) => result.ok)).toEqual([true, true]);
    expect(second.state.units[unitId]?.upgrades).toEqual({ cameras: 2, guards: 1 });
    expect(second.state.money).toBe(first.state.money - 50_000 - 25_000);
  });

  it('leaves the tower as it was when it is refused', () => {
    const { tower, unitId } = towerWith('security');
    const refused = step(tower, [buy(unitId, 'accessControl'), buy(unitId, 'accessControl', 'c2')], 0);
    expect(refused.results.map((result) => result.ok)).toEqual([true, true]);
    const third = step(refused.state, [buy(unitId, 'accessControl', 'c3')], 0);
    expect(third.results[0]).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
    expect(third.state.units[unitId]?.upgrades).toEqual({ accessControl: 2 });
    expect(third.state.money).toBe(refused.state.money);
  });

  it('refuses an upgrade the unit type does not have, and an unknown unit', () => {
    const { tower, unitId } = towerWith('office');
    expect(step(tower, [buy(unitId, 'cameras')], 0).results[0]).toMatchObject({
      ok: false,
      error: 'INVALID_COMMAND',
    });
    expect(step(tower, [buy('u999', 'cameras')], 0).results[0]).toMatchObject({
      ok: false,
      error: 'UNKNOWN_ENTITY',
    });
  });

  it('refuses when the money does not cover the price', () => {
    const { tower, unitId } = towerWith('security');
    tower.money = 1_000;
    const { state, results } = step(tower, [buy(unitId, 'cameras')], 0);
    expect(results[0]).toMatchObject({ ok: false });
    expect(state.units[unitId]?.upgrades).toBeUndefined();
  });
});
