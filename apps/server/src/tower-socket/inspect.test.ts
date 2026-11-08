import {
  addPerson,
  createTower,
  defaultSchedule,
  newUnit,
  STEPS_PER_DAY,
} from '@tower-magnate/engine';
import {
  ServerMessageSchema,
  serverMessage,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { inspectShaft, inspectUnit } from './inspect';

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

  it('shows the stored grade of the unit', () => {
    const { state, id } = towerWith('retail-shop');
    unitOf(state).evaluation = 'poor';

    expect(inspectUnit(state, id)).toMatchObject({ details: { evaluation: 'poor' } });
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

    unitOf(state).hotel = {
      state: 'occupied',
      stayEndStep: 5000,
      checkInStep: null,
      paidLevel: null,
    };
    expect(inspectUnit(state, id)).toMatchObject({
      details: { state: 'occupied', checkoutStep: 5000 },
    });
  });

  it('hides the checkout of a room that is not occupied', () => {
    const { state, id } = towerWith('suite');
    unitOf(state).hotel = { state: 'dirty', stayEndStep: 5000, checkInStep: null, paidLevel: null };

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

function carAt(homeLevel: number) {
  return {
    homeLevel,
    level: homeLevel,
    riders: [] as string[],
    trips: [],
    phase: 'idle' as const,
    direction: 'idle' as const,
    phaseStepsLeft: 0,
    assigned: [],
    paid: 0,
    placedAtStep: 0,
  };
}

function towerWithShaft(
  type: 'standard' | 'express' | 'service',
  homes: number[],
  stops: number[],
): TowerState {
  const state = createTower(3);
  state.shafts.s3 = {
    id: 's3',
    type,
    x: 30,
    bottom: stops[0] ?? 1,
    top: stops[stops.length - 1] ?? 1,
    stops,
    schedule: defaultSchedule(),
    cars: homes.map(carAt),
    queues: {},
    paid: 0,
    placedAtStep: 0,
  };
  return state;
}

describe('inspecting a shaft', () => {
  it('answers a standard shaft with its stops, cars and home levels', () => {
    const state = towerWithShaft('standard', [1, 3], [1, 2, 3]);
    state.shafts.s3?.cars[1]?.riders.push('p1', 'p2');

    const data = inspectShaft(state, 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({
      kind: 'shaft',
      id: 's3',
      status: 'ok',
      type: 'standard',
      bottom: 1,
      top: 3,
      stops: [1, 2, 3],
      cars: [
        { index: 0, homeLevel: 1, load: 0 },
        { index: 1, homeLevel: 3, load: 2 },
      ],
    });
  });

  it('answers an express shaft with its express levels', () => {
    const state = towerWithShaft('express', [1], [1, 15, 30]);

    const data = inspectShaft(state, 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ type: 'express', stops: [1, 15, 30] });
  });

  it('answers a service shaft', () => {
    const data = inspectShaft(towerWithShaft('service', [2], [1, 2]), 's3');

    expect(throughTheWire(data)).toBe(true);
    expect(data).toMatchObject({ type: 'service', stops: [1, 2] });
  });

  it('answers gone for a removed or unknown shaft', () => {
    const state = towerWithShaft('standard', [1], [1, 2]);
    delete state.shafts.s3;

    expect(inspectShaft(state, 's3')).toEqual({ kind: 'shaft', id: 's3', status: 'gone' });
    expect(inspectShaft(state, 'constructor')).toEqual({
      kind: 'shaft',
      id: 'constructor',
      status: 'gone',
    });
    expect(throughTheWire(inspectShaft(state, 's3'))).toBe(true);
  });

  it('leaves unit inspection unchanged', () => {
    const { state, id } = towerWith('office');

    expect(inspectUnit(state, id)).toMatchObject({ kind: 'unit', status: 'ok', type: 'office' });
  });

  it('answers in under half a millisecond for 8 cars and 100 levels', () => {
    const levels = Array.from({ length: 100 }, (_, index) => index + 1);
    const state = towerWithShaft('standard', [1, 10, 20, 30, 40, 50, 60, 70], levels);
    inspectShaft(state, 's3');

    const started = performance.now();
    for (let run = 0; run < 100; run += 1) {
      inspectShaft(state, 's3');
    }

    expect((performance.now() - started) / 100).toBeLessThan(0.5);
  });
});
