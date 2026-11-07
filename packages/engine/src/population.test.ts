import type { TowerState, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createLeaseSystem, moveInTenant } from './leases';
import { populationOf } from './population';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';

function towerWithUnits(types: ('office' | 'retail-shop')[]): { state: TowerState; ids: UnitId[] } {
  const units = types.map((type, index) => ({ type, x: index * 10, level: 2 }));
  const { state, unitIds } = buildTower({ ...plainTowerPlan(3, 0, 60), units });
  return { state, ids: unitIds as UnitId[] };
}

describe('population', () => {
  it('is 0 for an empty tower', () => {
    expect(populationOf(towerWithUnits([]).state).total).toBe(0);
  });

  it('does not count an office without a tenant', () => {
    expect(populationOf(towerWithUnits(['office']).state).offices).toBe(0);
  });

  it('counts 6 for each office with a tenant and nothing for a shop tenant yet', () => {
    const { state, ids } = towerWithUnits(['office', 'office', 'retail-shop']);
    for (const id of ids) {
      (state.units[id] as { lease: unknown }).lease = { anchorStep: 0, nextDueStep: 1 };
    }
    expect(populationOf(state)).toEqual({ offices: 12, total: 12 });
  });

  it('changes at the exact step of move-in', () => {
    const { state, ids } = towerWithUnits(['office']);
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        (context) => {
          if (context.state.step === 5) moveInTenant(context, ids[0] as UnitId);
        },
        createLeaseSystem(),
      ],
    });
    expect(populationOf(engine.step(state, [], 4).state).total).toBe(0);
    expect(populationOf(engine.step(state, [], 5).state).total).toBe(6);
  });

  it('drops an office when its unit is demolished', () => {
    const { state, ids } = towerWithUnits(['office', 'office']);
    for (const id of ids) {
      (state.units[id] as { lease: unknown }).lease = { anchorStep: 0, nextDueStep: 1 };
    }
    delete state.units[ids[0] as UnitId];
    expect(populationOf(state).total).toBe(6);
  });
});
