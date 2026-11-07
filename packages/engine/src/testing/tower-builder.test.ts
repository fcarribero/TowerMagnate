import { describe, expect, it } from 'vitest';
import { occupantAt, structureAt } from '../grid';
import { buildTower, plainTowerPlan } from './tower-builder';

describe('buildTower', () => {
  it('lays a main lobby on level 1 and floors above it', () => {
    const { state } = buildTower(plainTowerPlan(3, 100, 139));
    expect(structureAt(state.grid, 1, 100)).toBe('lobby');
    expect(structureAt(state.grid, 3, 139)).toBe('floor');
    expect(structureAt(state.grid, 4, 120)).toBeNull();
    expect(state.grid.mainLobbyHeight).toBe(1);
  });

  it('crosses from basements to level 1 without a level 0', () => {
    const { state } = buildTower({ floors: [{ from: -2, to: 2, x0: 0, x1: 9 }] });
    expect(
      Object.keys(state.grid.levels)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([-2, -1, 1, 2]);
  });

  it('places units with their catalog width and hands out ids in order', () => {
    const { state, unitIds, shaftIds } = buildTower({
      ...plainTowerPlan(2, 100, 139),
      units: [{ type: 'office', level: 2, x: 110 }],
      shafts: [{ type: 'standard', x: 100, bottom: 1, top: 2 }],
    });
    expect(unitIds).toEqual(['u1']);
    expect(shaftIds).toEqual(['s2']);
    expect(occupantAt(state.grid, 2, 118)).toEqual({ kind: 'unit', id: 'u1' });
    expect(occupantAt(state.grid, 2, 119)).toBeNull();
    expect(occupantAt(state.grid, 1, 103)).toEqual({ kind: 'shaft', id: 's2' });
    expect(occupantAt(state.grid, 1, 104)).toBeNull();
    expect(state.nextId).toBe(3);
  });

  it('gives multi-level units every level they cover', () => {
    const { state } = buildTower({
      ...plainTowerPlan(3, 100, 139),
      units: [{ type: 'cinema', level: 2, x: 100 }],
    });
    expect(occupantAt(state.grid, 2, 100)).toEqual({ kind: 'unit', id: 'u1' });
    expect(occupantAt(state.grid, 3, 100)).toEqual({ kind: 'unit', id: 'u1' });
  });

  it('refuses a unit with no floor under it', () => {
    expect(() =>
      buildTower({ ...plainTowerPlan(2, 100, 109), units: [{ type: 'office', level: 2, x: 105 }] }),
    ).toThrow(/has no floor/);
  });

  it('refuses units that overlap', () => {
    expect(() =>
      buildTower({
        ...plainTowerPlan(2, 100, 139),
        units: [
          { type: 'office', level: 2, x: 100 },
          { type: 'office', level: 2, x: 108 },
        ],
      }),
    ).toThrow(/already occupied/);
  });

  it('refuses shafts as units', () => {
    expect(() =>
      buildTower({
        ...plainTowerPlan(2, 100, 139),
        units: [{ type: 'standard-elevator', level: 1, x: 100 }],
      }),
    ).toThrow(/plan it as a shaft/);
  });
});
