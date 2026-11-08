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

const MORNING = 2880;

function setBand(tower: ShaftTower, band: Partial<Shaft['schedule']['weekday'][number]>): void {
  const { schedule } = shaftOf(tower);
  schedule.weekday[1] = { ...(schedule.weekday[1] as object), ...band } as never;
}

/** Elevators 13.4: car 0 loaded and moving up at level 4, car 1 idle at the lobby. */
function morningRush(mode: 'normal' | 'expressUp'): ShaftTower {
  const tower = shaftTower('standard', 30, [1, 1]);
  setBand(tower, { mode });
  const loaded = carOf(tower, 0);
  loaded.level = 4;
  loaded.direction = 'up';
  loaded.phase = 'moving';
  loadRiders(loaded, [6, 9, 15, 20]);
  tower.state.step = MORNING - 1;
  return tower;
}

describe('time bands and modes', () => {
  it('lets a loaded car take an up call above the lobby in normal mode', () => {
    const tower = morningRush('normal');
    callAt(tower, MORNING, 7, 'up', 20);
    expect(carOf(tower, 0).assigned).toEqual([{ level: 7, direction: 'up' }]);
  });

  it('keeps the call from a loaded car in expressUp until a free car is allowed to answer', () => {
    const tower = morningRush('expressUp');
    callAt(tower, MORNING, 7, 'up', 20);
    expect(carOf(tower, 0).assigned).toEqual([]);
    expect(carOf(tower, 1).assigned).toEqual([]);

    runTo(tower, MORNING + 30);
    expect(carOf(tower, 1).assigned).toEqual([{ level: 7, direction: 'up' }]);
  });

  it('still lets a loaded car answer an up call at the lobby stop in expressUp', () => {
    const tower = morningRush('expressUp');
    const loaded = carOf(tower, 0);
    loaded.level = 1;
    callAt(tower, MORNING, 1, 'up', 20);
    expect(carOf(tower, 1).assigned).toEqual([{ level: 1, direction: 'up' }]);
  });

  it('sends a free car to the lobby stop instead of its home in an expressUp band', () => {
    const tower = shaftTower('standard', 30, [10]);
    setBand(tower, { mode: 'expressUp' });
    tower.state.step = MORNING - 1;
    run(tower, 12);
    expect(carOf(tower).level).toBe(1);
  });

  it('skips down calls above the lobby for loaded cars in expressDown', () => {
    const tower = shaftTower('standard', 30, [1, 1]);
    setBand(tower, { mode: 'expressDown' });
    const loaded = carOf(tower, 0);
    loaded.level = 20;
    loaded.direction = 'down';
    loaded.phase = 'moving';
    loadRiders(loaded, [1]);
    tower.state.step = MORNING - 1;
    callAt(tower, MORNING, 12, 'down', 1);
    expect(loaded.assigned).toEqual([]);
  });

  it('uses the dwell of the band in force', () => {
    const tower = shaftTower('standard', 30);
    setBand(tower, { dwellSeconds: 0 });
    callAt(tower, MORNING, 1, 'up', 2);
    run(tower, 1);
    expect(carOf(tower).phase).toBe('closing');
  });

  it('applies the response distance of the band to free cars', () => {
    const tower = shaftTower('standard', 30, [1, 25]);
    setBand(tower, { responseDistance: 3 });
    const busy = carOf(tower, 1);
    busy.direction = 'down';
    busy.phase = 'moving';
    loadRiders(busy, [20]);
    tower.state.step = MORNING - 1;
    joinQueue(shaftOf(tower), 5, 'up', personEntityId(nextPerson++), 9, MORNING);
    run(tower, 1);
    expect(carOf(tower, 0).assigned).toEqual([]);

    setBand(tower, { responseDistance: 4 });
    run(tower, 1);
    expect(carOf(tower, 0).assigned).toEqual([{ level: 5, direction: 'up' }]);
  });

  it('reads the weekend schedule on Saturday', () => {
    const tower = shaftTower('standard', 30);
    shaftOf(tower).schedule.weekend[0] = { mode: 'normal', dwellSeconds: 0, responseDistance: 5 };
    const saturday = 5 * 8640 + 100;
    callAt(tower, saturday, 1, 'up', 2);
    run(tower, 1);
    expect(carOf(tower).phase).toBe('closing');
  });
});

describe('stop changes and bands in motion', () => {
  it('lets a rider off at the nearest enabled stop when theirs is disabled (elevators 13.5)', () => {
    const tower = shaftTower('standard', 30);
    const shaft = shaftOf(tower);
    shaft.stops = [8, 11, 12, 13];
    const car = carOf(tower);
    car.homeLevel = 8;
    car.level = 8;
    car.direction = 'up';
    car.phase = 'moving';
    loadRiders(car, [12]);
    const rider = car.riders[0] as EntityId;

    const { schedule } = shaft;
    const disable = {
      type: 'configureShaft' as const,
      shaftId: tower.shaftId,
      stops: [8, 11, 13],
      carHomes: [8],
      schedule,
    };
    const first = step(tower.state, [{ id: 'c1', command: disable }], 1);
    tower.state = first.state;
    const events = [...first.events, ...run(tower, 10)];

    const finished = rides(events);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ person: rider, level: 13 });
    expect(carOf(tower).riders).toEqual([]);
  });

  it('keeps the dwell of the band a stop opened in (elevators 13.6)', () => {
    const tower = shaftTower('standard', 30);
    const { schedule } = shaftOf(tower);
    schedule.weekday[4] = { mode: 'normal', dwellSeconds: 60, responseDistance: 5 };
    schedule.weekday[5] = { mode: 'normal', dwellSeconds: 0, responseDistance: 5 };

    callAt(tower, 6_118, 1, 'up', 2);
    run(tower, 1);
    expect(tower.state.step).toBe(6_119);
    expect(carOf(tower).phase).toBe('dwelling');
    expect(carOf(tower).phaseStepsLeft).toBe(6);

    run(tower, 2);
    expect(tower.state.step).toBe(6_121);
    expect(carOf(tower).phaseStepsLeft).toBe(4);
  });

  it('opens with the dwell of the new band from 17:00 on Monday (elevators 13.6)', () => {
    const tower = shaftTower('standard', 30);
    const { schedule } = shaftOf(tower);
    schedule.weekday[4] = { mode: 'normal', dwellSeconds: 60, responseDistance: 5 };
    schedule.weekday[5] = { mode: 'normal', dwellSeconds: 0, responseDistance: 5 };

    callAt(tower, 6_119, 1, 'up', 2);
    run(tower, 1);
    expect(tower.state.step).toBe(6_120);
    expect(carOf(tower).phase).toBe('closing');
  });
});
