import type { Level, TowerState, Unit } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson } from './people';
import { encodeResidentRoutine } from './resident-routine';
import { buildTower, plainTowerPlan } from './testing';
import { homesInUse, isUnitInUse, makesStandNoise } from './unit-use';
import { unitNumber } from './units';

function soldCondo(): { state: TowerState; condo: Unit } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 120),
    units: [{ type: 'condo', level: 2, x: 40 }],
  });
  const condo = state.units[unitIds[0] as string]!;
  condo.sale = { price: 80_000, anchorStep: 0, nextEvaluationStep: 100_000 };
  return { state, condo };
}

function residentAt(state: TowerState, condo: Unit, column: number, level = 2): number {
  addPerson(state, {
    kind: 'resident',
    homeUnit: unitNumber(condo.id),
    level: level as Level,
    column,
  });
  return state.people.id.length - 1;
}

describe('a home in use', () => {
  it('is a sold condo with one of its people awake inside it', () => {
    const { state, condo } = soldCondo();
    residentAt(state, condo, 42);
    expect(isUnitInUse(state, condo, homesInUse(state))).toBe(true);
  });

  it('is quiet when its people are all asleep', () => {
    const { state, condo } = soldCondo();
    const slot = residentAt(state, condo, 42);
    state.people.trip[slot] = encodeResidentRoutine({
      plan: 'works',
      phase: 'sleeping',
      venue: 0,
      slots: [0, 0, 0],
    });
    expect(homesInUse(state).has(unitNumber(condo.id))).toBe(false);
    expect(isUnitInUse(state, condo, homesInUse(state))).toBe(false);
  });

  it('is quiet when nobody of it is inside it', () => {
    const { state, condo } = soldCondo();
    residentAt(state, condo, 100);
    expect(isUnitInUse(state, condo, homesInUse(state))).toBe(false);
  });
});

describe('noise of a person standing still', () => {
  it('comes from people awake and not from people asleep', () => {
    const { state, condo } = soldCondo();
    const slot = residentAt(state, condo, 42);
    expect(makesStandNoise(state.people, slot)).toBe(true);
    state.people.trip[slot] = encodeResidentRoutine({
      plan: 'works',
      phase: 'sleeping',
      venue: 0,
      slots: [0, 0, 0],
    });
    expect(makesStandNoise(state.people, slot)).toBe(false);
  });
});
