import type { EngineEvent, EntityId, Level, Shaft, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { joinQueue } from './elevator-queues';
import { personEntityId } from './people';
import { step } from './step';
import { buildTower, plainTowerPlan, type ShaftType } from './testing';

interface ShaftTower {
  state: TowerState;
  shaftId: string;
}

type Car = Shaft['cars'][number];

function shaftTower(type: ShaftType, top: Level, homes: Level[] = [1]): ShaftTower {
  const plan = plainTowerPlan(top, 0, 60);
  plan.shafts = [{ type, x: 30, bottom: 1, top }];
  const { state, shaftIds } = buildTower(plan);
  const shaftId = shaftIds[0] as string;
  const shaft = state.shafts[shaftId] as Shaft;
  const [first] = shaft.cars;
  if (!first) throw new Error('shaft has no car');
  shaft.cars = homes.map((home) => ({ ...structuredClone(first), homeLevel: home, level: home }));
  return { state, shaftId };
}

function shaftOf(tower: ShaftTower): Shaft {
  return tower.state.shafts[tower.shaftId] as Shaft;
}

function carOf(tower: ShaftTower, index = 0): Car {
  return shaftOf(tower).cars[index] as Car;
}

let nextPerson = 1;

/** Someone joins a queue at `atStep` and the first elevator phase of that step runs. */
function callAt(
  tower: ShaftTower,
  atStep: number,
  level: Level,
  direction: 'up' | 'down',
  destination: Level,
): EntityId {
  const person = personEntityId(nextPerson++);
  tower.state.step = atStep - 1;
  joinQueue(shaftOf(tower), level, direction, person, destination, atStep);
  run(tower, 1);
  return person;
}

function run(tower: ShaftTower, steps: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (let count = 0; count < steps; count++) {
    const result = step(tower.state, [], 1);
    tower.state = result.state;
    events.push(...result.events);
  }
  return events;
}

function runTo(tower: ShaftTower, target: number): EngineEvent[] {
  return run(tower, target - tower.state.step);
}

function rides(events: EngineEvent[]) {
  return events.flatMap((event) => (event.type === 'rideFinished' ? [event] : []));
}

function loadRiders(car: Car, destinations: Level[]): void {
  for (const destination of destinations) {
    car.riders.push(personEntityId(nextPerson++));
    car.trips.push({ destination, boardedStep: 0, waitSteps: 0 });
  }
}

describe('car motion', () => {
  it('carries one rider 29 floors in 34 steps on a standard car (elevators 13.1)', () => {
    const tower = shaftTower('standard', 30);
    const rider = callAt(tower, 1000, 1, 'up', 30);

    expect(rides(runTo(tower, 1040))).toEqual([
      {
        type: 'rideFinished',
        step: 1035,
        person: rider,
        shaftId: tower.shaftId,
        carIndex: 0,
        level: 30,
        waitSteps: 1,
        rideSteps: 34,
      },
    ]);
  });

  it('moves an express car 3 floors a step and arrives in 15 steps', () => {
    const tower = shaftTower('express', 30);
    callAt(tower, 1000, 1, 'up', 30);

    expect(rides(runTo(tower, 1040))[0]).toMatchObject({ level: 30, step: 1016, rideSteps: 15 });
  });

  it('keeps a car on whole levels and never past its stop', () => {
    const tower = shaftTower('express', 30);
    callAt(tower, 1000, 1, 'up', 30);
    const positions: Level[] = [];
    for (let count = 0; count < 20; count++) {
      run(tower, 1);
      positions.push(carOf(tower).level);
    }
    expect(Math.max(...positions)).toBe(30);
    expect(positions.every(Number.isInteger)).toBe(true);
  });

  it('opens, dwells for 3 steps and closes before moving', () => {
    const tower = shaftTower('standard', 30);
    callAt(tower, 1000, 1, 'up', 30);
    const phases: string[] = [];
    for (let count = 0; count < 8; count++) {
      run(tower, 1);
      phases.push(carOf(tower).phase);
    }
    expect(phases).toEqual([
      'dwelling',
      'dwelling',
      'dwelling',
      'closing',
      'idle',
      'moving',
      'moving',
      'moving',
    ]);
  });
});

describe('dispatch', () => {
  it('sends the nearest free car within reach and holds the far call (elevators 13.2)', () => {
    const tower = shaftTower('standard', 20, [1, 12]);
    tower.state.step = 4999;
    const p1 = personEntityId(nextPerson++);
    const p2 = personEntityId(nextPerson++);
    joinQueue(shaftOf(tower), 8, 'up', p1, 15, 5000);
    joinQueue(shaftOf(tower), 18, 'down', p2, 1, 5000);

    const finished = rides(runTo(tower, 5050));

    expect(finished.map((ride) => [ride.person, ride.carIndex, ride.step])).toEqual([
      [p1, 1, 5017],
      [p2, 1, 5047],
    ]);
    expect(finished[0]).toMatchObject({ waitSteps: 5, rideSteps: 12 });
    expect(finished[1]).toMatchObject({ waitSteps: 25, rideSteps: 22 });
  });

  it('lets a loaded car pick up a call ahead of it as a coming car (elevators 13.4, normal mode)', () => {
    const tower = shaftTower('standard', 20, [1, 1]);
    const loaded = carOf(tower, 0);
    loaded.level = 3;
    loaded.direction = 'up';
    loaded.phase = 'moving';
    loadRiders(loaded, [6, 9, 15, 20]);
    const waiting = callAt(tower, 5000, 7, 'up', 12);

    const finished = rides(runTo(tower, 5100));

    expect(finished.find((ride) => ride.level === 6)?.step).toBe(5003);
    expect(finished.find((ride) => ride.person === waiting)).toMatchObject({
      carIndex: 0,
      waitSteps: 9,
    });
  });

  it('gives a far call to a free car only after 30 steps while another car is busy', () => {
    const tower = shaftTower('standard', 40, [1, 1]);
    const busy = carOf(tower, 1);
    busy.direction = 'down';
    busy.phase = 'moving';
    busy.level = 40;
    loadRiders(busy, [1]);
    callAt(tower, 1000, 30, 'up', 40);
    expect(carOf(tower, 0).assigned).toEqual([]);

    runTo(tower, 1030);

    expect(carOf(tower, 0).assigned).toEqual([{ level: 30, direction: 'up' }]);
  });

  it('boards 21 into a standard car and leaves the rest for the next car', () => {
    const tower = shaftTower('standard', 20, [1, 1]);
    tower.state.step = 999;
    const queue = Array.from({ length: 25 }, () => {
      const person = personEntityId(nextPerson++);
      joinQueue(shaftOf(tower), 1, 'up', person, 10, 1000);
      return person;
    });

    const finished = rides(runTo(tower, 1100));

    expect(finished).toHaveLength(25);
    const carFor = (person: EntityId) => finished.find((ride) => ride.person === person)?.carIndex;
    expect(new Set(queue.slice(0, 21).map(carFor))).toEqual(new Set([0]));
    expect(new Set(queue.slice(21).map(carFor))).toEqual(new Set([1]));
  });

  it('returns a free car to its home level and idles there', () => {
    const tower = shaftTower('standard', 20, [5]);
    carOf(tower).level = 12;

    run(tower, 20);

    expect(carOf(tower)).toMatchObject({ level: 5, phase: 'idle', direction: 'idle' });
  });

  it('forgets a call whose queue emptied before the car arrived', () => {
    const tower = shaftTower('standard', 20, [1]);
    callAt(tower, 1000, 15, 'up', 20);
    expect(carOf(tower).assigned).toHaveLength(1);

    shaftOf(tower).queues = {};
    run(tower, 1);

    expect(carOf(tower).assigned).toEqual([]);
  });

  it('stops for a rider before the call it was sent to when the rider is nearer', () => {
    const tower = shaftTower('standard', 30, [1]);
    const car = carOf(tower);
    car.level = 3;
    car.direction = 'up';
    car.phase = 'moving';
    loadRiders(car, [8]);
    callAt(tower, 2000, 20, 'up', 25);

    const finished = rides(runTo(tower, 2100));

    expect(finished.map((ride) => ride.level)).toEqual([8, 25]);
  });
});

describe('elevator scenarios', () => {
  it('serves one hour of random calls with every person delivered and nobody starved', () => {
    const tower = shaftTower('standard', 30, [1, 15]);
    let seed = 12345;
    const random = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * limit);
    };
    let issued = 0;
    const finished: ReturnType<typeof rides> = [];
    for (let count = 0; count < 360; count++) {
      if (random(6) === 0) {
        const from = 1 + random(30);
        const to = 1 + random(30);
        if (from !== to) {
          issued += 1;
          const person = personEntityId(nextPerson++);
          joinQueue(
            shaftOf(tower),
            from,
            to > from ? 'up' : 'down',
            person,
            to,
            tower.state.step + 1,
          );
        }
      }
      finished.push(...rides(run(tower, 1)));
    }
    finished.push(...rides(run(tower, 600)));

    expect(finished).toHaveLength(issued);
    expect(Math.max(...finished.map((ride) => ride.waitSteps))).toBeLessThan(250);
  });

  it('gives the same car positions for the same tower', () => {
    const trace = () => {
      const tower = shaftTower('standard', 30, [1, 15]);
      for (const [from, to] of [
        [1, 10],
        [25, 3],
        [10, 25],
      ] as const) {
        const person = personEntityId(nextPerson++);
        joinQueue(shaftOf(tower), from, to > from ? 'up' : 'down', person, to, 0);
      }
      const positions: Level[] = [];
      for (let count = 0; count < 120; count++) {
        run(tower, 1);
        positions.push(...shaftOf(tower).cars.map((car) => car.level));
      }
      return positions;
    };
    expect(trace()).toEqual(trace());
  });
});
