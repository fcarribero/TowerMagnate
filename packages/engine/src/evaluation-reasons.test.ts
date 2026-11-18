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
  it('has the neutral score, the base price as fair price and no noise in a quiet new tower', () => {
    const { state, unit } = office();
    unit.price = unit.appraisal;
    expect(evaluationParts(state, unit)).toEqual({
      occupantScore: 3,
      fairPrice: 10_000,
      price: 10_000,
      noisy: false,
      mainCause: null,
      pulledBy: null,
      parking: null,
    });
  });

  it('names the worse neighbor that pulls the office down', () => {
    const { state, unit } = office();
    const next = buildTower({
      ...plainTowerPlan(3, 0, 120),
      units: [
        { type: 'office', level: 2, x: 40 },
        { type: 'office', level: 2, x: 49 },
      ],
    }).state;
    const [mine, theirs] = Object.values(next.units).filter((u) => u.type === 'office');
    if (!mine || !theirs) throw new Error('no offices');
    theirs.lease = { anchorStep: 0, nextDueStep: 1e9, weekVisits: 0, rent: 1 };
    theirs.price = theirs.appraisal * 2;
    mine.price = mine.appraisal;
    expect(evaluationParts(next, mine).pulledBy).toBe(theirs.id);
    expect(evaluationParts(state, unit).pulledBy).toBeNull();
  });

  it('names the cause that weighs most on the office workers, never calm', () => {
    const { state, unit } = office();
    const [first, second] = workerSlots(state, unit);
    if (first === undefined || second === undefined) throw new Error('office has no workers');
    addFlight(state.people, first, 'stairs');
    addAmbient(state.people, second, 10);
    addAmbient(state.people, second, -500);
    expect(evaluationParts(state, unit).mainCause).toBe('stairs');
  });
});
