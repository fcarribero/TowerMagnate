import { addPerson, createTower, newUnit, STEPS_PER_DAY } from '@tower-magnate/engine';
import {
  ServerMessageSchema,
  serverMessage,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { inspectUnit } from './inspect';

const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;

function towerWith(type: Parameters<typeof newUnit>[1]): { state: TowerState; id: string } {
  const state = createTower(3);
  state.units.u7 = newUnit('u7', type, 10, 4);
  return { state, id: 'u7' };
}

function unitOf(state: TowerState): Unit {
  const unit = state.units.u7;
  if (!unit) {
    throw new Error('Unit u7 is missing');
  }
  return unit;
}

function addOfficeWorkers(state: TowerState, unitNumber: number, count: number): void {
  for (let index = 0; index < count; index += 1) {
    addPerson(state, { kind: 'officeWorker', homeUnit: unitNumber, level: 4, column: 10 });
  }
}

function throughTheWire(data: ReturnType<typeof inspectUnit>) {
  const message = JSON.parse(JSON.stringify(serverMessage('inspect', data)));
  return ServerMessageSchema.safeParse(message).success;
}

describe('inspecting a unit', () => {
  it('answers an office for rent with the common fields and lease fields', () => {
    const { state, id } = towerWith('office');

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toEqual({
      kind: 'unit',
      id: 'u7',
      status: 'ok',
      name: null,
      type: 'office',
      level: 4,
      from: 10,
      to: 18,
      details: {
        group: 'lease',
        state: 'forRent',
        persons: 0,
        capacity: 6,
        evaluation: null,
        price: 'normal',
        leaseWeek: null,
        nextPaymentStep: null,
      },
    });
  });

  it('shows a let office with its persons, lease week and next payment', () => {
    const { state, id } = towerWith('office');
    unitOf(state).name = 'Oficinas';
    unitOf(state).lease = { anchorStep: 0, nextDueStep: 2 * STEPS_PER_WEEK };
    state.step = STEPS_PER_WEEK + 5;
    addOfficeWorkers(state, 7, 6);

    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      name: 'Oficinas',
      details: {
        state: 'occupied',
        persons: 6,
        leaseWeek: 2,
        nextPaymentStep: 2 * STEPS_PER_WEEK,
      },
    });
  });

  it('caps the lease week at the length of the contract', () => {
    const { state, id } = towerWith('retail-shop');
    unitOf(state).lease = { anchorStep: 0, nextDueStep: 4 * STEPS_PER_WEEK };
    state.step = 4 * STEPS_PER_WEEK;

    expect(inspectUnit(state, id)).toMatchObject({ details: { group: 'lease', leaseWeek: 4 } });
  });

  it('answers a shop like an office', () => {
    const { state, id } = towerWith('retail-shop');

    expect(inspectUnit(state, id)).toMatchObject({
      type: 'retail-shop',
      details: { group: 'lease', state: 'forRent' },
    });
  });

  it('answers a condo for sale and a sold one', () => {
    const { state, id } = towerWith('condo');
    const forSale = inspectUnit(state, id);

    expect(throughTheWire(forSale)).toBe(true);
    expect(forSale).toMatchObject({
      details: { group: 'condo', state: 'forSale', residents: 0, capacity: 3 },
    });

    unitOf(state).sale = { price: 1, anchorStep: 0, nextEvaluationStep: 999 };
    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'sold', nextEvaluationStep: 999 },
    });
  });

  it('answers a free hotel room and an occupied one with its checkout', () => {
    const { state, id } = towerWith('double-room');
    const free = inspectUnit(state, id);

    expect(throughTheWire(free)).toBe(true);
    expect(free).toMatchObject({
      details: { group: 'hotel', state: 'clean', guests: 0, capacity: 2, checkoutStep: null },
    });

    unitOf(state).hotel = { state: 'occupied', stayEndStep: 5000 };
    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'occupied', checkoutStep: 5000 },
    });
  });

  it('hides the checkout of a room that is not occupied', () => {
    const { state, id } = towerWith('suite');
    unitOf(state).hotel = { state: 'dirty', stayEndStep: 5000 };

    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'dirty', checkoutStep: null },
    });
  });

  it('answers a cinema with its price and no film data yet', () => {
    const { state, id } = towerWith('cinema');
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      type: 'cinema',
      details: { group: 'cinema', filmWeek: null, filmAgeDays: null, price: 'normal' },
    });
  });

  it('answers other unit types with the common fields only', () => {
    const { state, id } = towerWith('security');
    const data = inspectUnit(state, id);

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ status: 'ok', type: 'security', details: null });
  });

  it('answers gone for an unknown unit', () => {
    const state = createTower(3);

    expect(inspectUnit(state, 'u99')).toEqual({ kind: 'unit', id: 'u99', status: 'gone' });
    expect(inspectUnit(state, 'constructor')).toEqual({
      kind: 'unit',
      id: 'constructor',
      status: 'gone',
    });
  });

  it('answers in under a millisecond in a 15,000 person tower', () => {
    const { state, id } = towerWith('office');
    for (let index = 0; index < 15_000; index += 1) {
      addPerson(state, { kind: 'officeWorker', homeUnit: 1 + (index % 2500), level: 2, column: 5 });
    }
    inspectUnit(state, id);

    const started = performance.now();
    for (let run = 0; run < 100; run += 1) {
      inspectUnit(state, id);
    }

    expect((performance.now() - started) / 100).toBeLessThan(1);
  });
});
