import type { TowerState, Unit, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { evaluationParts } from './evaluation-reasons';
import { addPeopleForUnit } from './people';
import { buildTower, plainTowerPlan } from './testing';
import { addAmbient, addFlight } from './trip-ledger';
import { unitNumber } from './units';

function office(): { state: TowerState; unit: Unit } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 120),
    units: [{ type: 'office', level: 2, x: 40 }],
  });
  const id = unitIds[0] as UnitId;
  addPeopleForUnit(state, id);
  return { state, unit: state.units[id] as Unit };
}

function workerSlots(state: TowerState, unit: Unit): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < state.people.id.length; slot++) {
    if (state.people.homeUnit[slot] === unitNumber(unit.id)) slots.push(slot);
  }
  return slots;
}

describe('evaluation parts of an office', () => {
  it('has no stress, no price adjustment and no noise at the appraisal in a quiet tower', () => {
    const { state, unit } = office();
    unit.price = unit.appraisal;
    expect(evaluationParts(state, unit)).toEqual({
      base: 0,
      price: 0,
      minimumPrice: false,
      noise: 0,
      mainCause: null,
    });
  });

  it('adds to the score above the appraisal, takes off below it, and grades good at the minimum', () => {
    const { state, unit } = office();
    unit.price = unit.appraisal * 1.5;
    expect(evaluationParts(state, unit).price).toBeGreaterThan(0);
    unit.price = Math.round(unit.appraisal * 0.8);
    expect(evaluationParts(state, unit).price).toBeLessThan(0);
    unit.price = 1;
    expect(evaluationParts(state, unit)).toMatchObject({ minimumPrice: true, price: 0 });
  });

  it('names the cause that weighs most on the office workers, never calm', () => {
    const { state, unit } = office();
    const [first, second] = workerSlots(state, unit);
    if (first === undefined || second === undefined) throw new Error('office has no workers');
    addFlight(state.people, first, 'stairs');
    addAmbient(state.people, second, 10, 'walk');
    addAmbient(state.people, second, -500);
    expect(evaluationParts(state, unit).mainCause).toBe('stairs');
  });
});
