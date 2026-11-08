import type { EntityId, Shaft, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  boardFromQueue,
  fullQueueSurcharge,
  hallCallAge,
  isQueueFull,
  joinQueue,
  leaveQueues,
  nextQueueCheckStep,
  queueLength,
} from './elevator-queues';
import { addPerson, personEntityId, removePeopleOfUnit, removePerson } from './people';
import { buildTower, plainTowerPlan, type ShaftType } from './testing';

function shaftTower(type: ShaftType, carCount = 1): { shaft: Shaft; state: TowerState } {
  const plan = plainTowerPlan(20, 0, 60);
  plan.shafts = [{ type, x: 30, bottom: 1, top: 20 }];
  const { state, shaftIds } = buildTower(plan);
  const shaft = state.shafts[shaftIds[0] as string] as Shaft;
  const [car] = shaft.cars;
  for (let index = 1; index < carCount; index++) {
    shaft.cars.push({ ...(car as Shaft['cars'][number]), riders: [] });
  }
  return { shaft, state };
}

function person(number: number): EntityId {
  return personEntityId(number);
}

function waiting(shaft: Shaft, count: number, step = 0): EntityId[] {
  const people = Array.from({ length: count }, (_, index) => person(index + 1));
  people.forEach((id) => joinQueue(shaft, 1, 'up', id, step));
  return people;
}

function placePeople(state: TowerState, homeUnits: number[]): EntityId[] {
  return homeUnits.map((homeUnit) =>
    personEntityId(addPerson(state, { kind: 'officeWorker', homeUnit, level: 1, column: 10 })),
  );
}

describe('floor queues', () => {
  it('does not queue the 41st person and charges the full-queue surcharge', () => {
    const { shaft } = shaftTower('standard');
    waiting(shaft, 40);

    expect(joinQueue(shaft, 1, 'up', person(41), 0)).toBe(false);
    expect(queueLength(shaft, 1, 'up')).toBe(40);
    expect(isQueueFull(shaft, 1, 'up')).toBe(true);
    expect(fullQueueSurcharge(shaft, 1, 'up')).toBe(1_000);
    expect(fullQueueSurcharge(shaft, 1, 'down')).toBe(0);
  });

  it('keeps up and down queues apart at each stop', () => {
    const { shaft } = shaftTower('standard');
    joinQueue(shaft, 1, 'up', person(1), 0);
    joinQueue(shaft, 1, 'down', person(2), 0);
    joinQueue(shaft, 3, 'up', person(3), 0);

    expect(queueLength(shaft, 1, 'up')).toBe(1);
    expect(queueLength(shaft, 1, 'down')).toBe(1);
    expect(queueLength(shaft, 3, 'up')).toBe(1);
    expect(queueLength(shaft, 2, 'up')).toBe(0);
  });

  it('rechecks a full queue every 6 steps', () => {
    expect(nextQueueCheckStep(100)).toBe(106);
  });

  it('ages a hall call from the step the front person joined', () => {
    const { shaft } = shaftTower('standard');
    expect(hallCallAge(shaft, 1, 'up', 50)).toBeNull();
    joinQueue(shaft, 1, 'up', person(1), 10);
    joinQueue(shaft, 1, 'up', person(2), 30);
    expect(hallCallAge(shaft, 1, 'up', 50)).toBe(40);
  });
});

describe('boarding', () => {
  it('queues 40 of 45 arrivals and boards the first 21 in id order', () => {
    const { shaft } = shaftTower('standard');
    const arrivals = Array.from({ length: 45 }, (_, index) => person(index + 1));
    const joined = arrivals.filter((id) => joinQueue(shaft, 1, 'up', id, 0));

    expect(joined).toEqual(arrivals.slice(0, 40));
    expect(boardFromQueue(shaft, 0, 1, 'up')).toEqual(arrivals.slice(0, 21));
  });

  it('never boards more than 21 into a standard car', () => {
    const { shaft } = shaftTower('standard');
    const people = waiting(shaft, 40);

    const boarded = boardFromQueue(shaft, 0, 1, 'up');

    expect(boarded).toEqual(people.slice(0, 21));
    expect(shaft.cars[0]?.riders).toEqual(people.slice(0, 21));
    expect(queueLength(shaft, 1, 'up')).toBe(19);
    expect(boardFromQueue(shaft, 0, 1, 'up')).toEqual([]);
  });

  it('lets an express car take 42', () => {
    const { shaft } = shaftTower('express');
    const car = shaft.cars[0];
    if (!car) throw new Error('Expected a car');
    car.riders = Array.from({ length: 5 }, (_, index) => person(100 + index));
    waiting(shaft, 40);

    expect(boardFromQueue(shaft, 0, 1, 'up')).toHaveLength(37);
    expect(car.riders).toHaveLength(42);
    expect(queueLength(shaft, 1, 'up')).toBe(3);
  });

  it('counts riders already in the car', () => {
    const { shaft } = shaftTower('standard');
    const car = shaft.cars[0];
    if (!car) throw new Error('Expected a car');
    car.riders = Array.from({ length: 18 }, (_, index) => person(100 + index));
    waiting(shaft, 10);

    expect(boardFromQueue(shaft, 0, 1, 'up')).toHaveLength(3);
    expect(car.riders).toHaveLength(21);
  });

  it('serves the next car from where the first stopped and drops the emptied stop', () => {
    const { shaft } = shaftTower('standard', 2);
    const people = waiting(shaft, 25);

    boardFromQueue(shaft, 0, 1, 'up');
    expect(boardFromQueue(shaft, 1, 1, 'up')).toEqual(people.slice(21));
    expect(shaft.queues).toEqual({});
  });
});

describe('leaving a queue', () => {
  it('moves everyone behind up one place when someone leaves', () => {
    const { shaft, state } = shaftTower('standard');
    const people = waiting(shaft, 5);

    leaveQueues(state, [people[1] as EntityId]);

    expect(boardFromQueue(shaft, 0, 1, 'up')).toEqual([people[0], ...people.slice(2)]);
  });

  it('frees a place in a full queue', () => {
    const { shaft, state } = shaftTower('standard');
    const people = waiting(shaft, 40);

    leaveQueues(state, [people[10] as EntityId]);

    expect(joinQueue(shaft, 1, 'up', person(41), 0)).toBe(true);
  });

  it('keeps queue order when the people of a demolished home are removed', () => {
    const { shaft, state } = shaftTower('standard');
    const ids = placePeople(state, [1, 1, 2, 2]);
    ids.forEach((id) => joinQueue(shaft, 1, 'up', id, 0));

    removePeopleOfUnit(state, 'u1');

    expect(boardFromQueue(shaft, 0, 1, 'up')).toEqual([ids[2], ids[3]]);
  });

  it('removes a single person from the queue', () => {
    const { shaft, state } = shaftTower('standard');
    const ids = placePeople(state, [0, 0, 0]);
    ids.forEach((id) => joinQueue(shaft, 1, 'down', id, 0));

    removePerson(state, 2);

    expect(queueLength(shaft, 1, 'down')).toBe(2);
  });
});
