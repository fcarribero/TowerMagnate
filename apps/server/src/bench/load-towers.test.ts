import { buildTower } from '@tower-magnate/engine/testing';
import { describe, expect, it } from 'vitest';
import { midSizeTowerPlan, wholeTowerViewport } from './load-towers';

describe('midSizeTowerPlan', () => {
  it('fills 20 floors with offices below and condos above, served by two elevators', () => {
    const plan = midSizeTowerPlan(20);
    const units = plan.units ?? [];

    expect(units.filter((unit) => unit.type === 'office')).toHaveLength(90);
    expect(units.filter((unit) => unit.type === 'condo')).toHaveLength(50);
    expect(Math.max(...units.map((unit) => unit.level))).toBe(20);
    expect(plan.shafts).toHaveLength(2);
  });

  it('builds every planned unit and shaft', () => {
    const built = buildTower(midSizeTowerPlan(20));

    expect(built.unitIds).toHaveLength(140);
    expect(built.shaftIds).toHaveLength(2);
  });
});

describe('wholeTowerViewport', () => {
  it('covers every floor of the tower', () => {
    expect(wholeTowerViewport(20)).toMatchObject({ levelFrom: 1, levelTo: 20 });
  });
});
