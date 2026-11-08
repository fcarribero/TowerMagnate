import {
  ELEVATOR_QUEUE_CAPACITY,
  type Level,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addFlight, buildTower, type PlannedShaft, type TowerPlan } from '../testing';
import { noRouteOutcome, TripPlanner, type RoutePlan, type TripBudget } from './route-planner';
import { TransportGraph, type ShaftStops, type UserClass } from './transport-graph';

interface Flight {
  type: 'stairs' | 'escalator';
  x: number;
  level: Level;
}

interface Setup {
  plan: TowerPlan;
  flights?: Flight[];
  stops?: (shaftIds: string[]) => ShaftStops;
}

function setup({ plan, flights = [], stops }: Setup) {
  const { state, shaftIds } = buildTower(plan);
  for (const flight of flights) addFlight(state, flight.type, flight.x, flight.level);
  const graph = new TransportGraph(state, stops ? stops(shaftIds) : new Map());
  return { state, shaftIds, graph, planner: new TripPlanner(graph) };
}

function plan(
  built: ReturnType<typeof setup>,
  from: [Level, number],
  to: [Level, number],
  userClass: UserClass = 'other',
  budget?: TripBudget,
): RoutePlan | null {
  return built.planner.plan(built.state, {
    from: { level: from[0], x: from[1] },
    to: { level: to[0], x: to[1] },
    userClass,
    budget,
  });
}

function fillQueue(state: TowerState, shaftId: string, level: Level, direction: 'up' | 'down') {
  const shaft = state.shafts[shaftId] as Shaft;
  const queue = (shaft.queues[String(level)] ??= { up: [], down: [] });
  for (let index = 0; index < ELEVATOR_QUEUE_CAPACITY; index++) {
    queue[direction].push({ person: `p${index}`, destination: level, joinedStep: 0 });
  }
}

function tower(floors: number, x0: number, x1: number, shafts: PlannedShaft[] = []): TowerPlan {
  return { lobby: { x0, x1 }, floors: [{ from: 2, to: floors, x0, x1 }], shafts };
}

function flightsUp(type: Flight['type'], from: Level, to: Level, x = 200): Flight[] {
  const flights: Flight[] = [];
  for (let level = from; level < to; level++) flights.push({ type, x, level });
  return flights;
}

const NO_EXTRA_FLIGHTS: Flight[] = [];

function first(ids: string[]): string {
  return ids[0] as string;
}

function third(ids: string[]): string {
  return ids[2] as string;
}

describe('tower A: stairs and one elevator (routing 12.1)', () => {
  const flights: Flight[] = [
    { type: 'escalator', x: 160, level: 1 },
    { type: 'stairs', x: 130, level: 1 },
    { type: 'stairs', x: 120, level: 2 },
    { type: 'stairs', x: 120, level: 3 },
  ];

  function towerA() {
    return setup({
      plan: tower(6, 100, 179, [{ type: 'standard', x: 140, bottom: 1, top: 6 }]),
      flights,
    });
  }

  it('A1: takes the elevator alone when it ties an escalator plus elevator', () => {
    const route = plan(towerA(), [1, 100], [4, 104]);
    expect(route).toMatchObject({ cost: 524, transportLegs: 1, columnsWalked: 80 });
    expect(route?.firstLeg).toMatchObject({ kind: 'ride', walkColumns: 42 });
  });

  it('A2: takes the elevator down, and the stairs when its queue is full', () => {
    const built = towerA();
    expect(plan(built, [4, 104], [2, 112])).toMatchObject({ cost: 516 });
    fillQueue(built.state, first(built.shaftIds), 4, 'down');
    const route = plan(built, [4, 104], [2, 112]);
    expect(route).toMatchObject({ cost: 616 });
    expect(route?.firstLeg).toMatchObject({ kind: 'stairs', walkColumns: 20 });
    expect(route?.firstLeg?.steps).toHaveLength(2);
  });

  it('A3: has no route to level 6 once the elevator is gone', () => {
    const built = setup({ plan: tower(6, 100, 179), flights });
    expect(plan(built, [1, 100], [6, 154])).toBeNull();
  });
});

describe('tower B: sky lobby and one transfer (routing 12.2)', () => {
  function towerB() {
    return setup({
      plan: tower(44, 50, 249, [
        { type: 'express', x: 60, bottom: 1, top: 30 },
        { type: 'standard', x: 120, bottom: 1, top: 15 },
        { type: 'standard', x: 200, bottom: 15, top: 44 },
      ]),
      flights: [
        { type: 'stairs', x: 220, level: 15 },
        { type: 'stairs', x: 220, level: 16 },
      ],
      stops: (ids) => new Map([[first(ids), [1, 15, 30]]]),
    });
  }

  it('B1: rides the express to the sky lobby and transfers', () => {
    const route = plan(towerB(), [1, 249], [22, 214]);
    expect(route).toMatchObject({ cost: 3598, transportLegs: 2 });
    expect(route?.firstLeg).toMatchObject({ kind: 'ride', walkColumns: 186 });
    expect(route?.firstLeg?.steps[0]?.kind).toBe('express');
  });

  it('B2: takes the local elevator when the express queue is full', () => {
    const built = towerB();
    fillQueue(built.state, first(built.shaftIds), 1, 'up');
    const route = plan(built, [1, 249], [22, 214]);
    expect(route).toMatchObject({ cost: 3668 });
    expect(route?.firstLeg).toMatchObject({ kind: 'ride', walkColumns: 127 });
    expect(route?.firstLeg?.steps[0]?.kind).toBe('standard');
  });

  it('B3: climbs one flight when the transfer queue is full, ending on the lower level', () => {
    const built = towerB();
    fillQueue(built.state, third(built.shaftIds), 15, 'up');
    const route = plan(built, [15, 63], [22, 214], 'other', {
      stairFloors: 0,
      escalatorFloors: 0,
      rides: 1,
    });
    expect(route).toMatchObject({ cost: 3656, transportLegs: 2, columnsWalked: 195 });
    expect(route?.firstLeg).toMatchObject({ kind: 'stairs', walkColumns: 161 });
    expect(route?.firstLeg?.steps).toHaveLength(1);
    expect(built.graph.node(route?.firstLeg?.steps[0]?.to ?? -1).level).toBe(16);
  });
});

describe('tower C: stairs before a transfer, cathedral and a maid (routing 12.3)', () => {
  const expressStops = [-7, 1, 15, 30, 45, 60, 75, 90];

  function towerC() {
    return setup({
      plan: {
        lobby: { x0: 40, x1: 339 },
        floors: [
          { from: -9, to: -1, x0: 40, x1: 339 },
          { from: 2, to: 100, x0: 40, x1: 339 },
          { from: 101, to: 101, x0: 140, x1: 200 },
        ],
        shafts: [
          { type: 'express', x: 60, bottom: -9, top: 90 },
          { type: 'standard', x: 150, bottom: 45, top: 74 },
          { type: 'standard', x: 150, bottom: 90, top: 101 },
          { type: 'service', x: 260, bottom: 46, top: 75 },
        ],
      },
      flights: [
        { type: 'stairs', x: 170, level: 45 },
        { type: 'stairs', x: 170, level: 46 },
      ],
      stops: (ids) => new Map([[first(ids), expressStops]]),
    });
  }

  it('C1: prefers two flights of stairs to a transfer', () => {
    const route = plan(towerC(), [-7, 110], [47, 184]);
    expect(route).toMatchObject({ cost: 1269, transportLegs: 2, columnsWalked: 168 });
    expect(route?.firstLeg).toMatchObject({ kind: 'ride', walkColumns: 47 });
  });

  it('C2: reaches the cathedral only while the level 101 stop is enabled', () => {
    const built = towerC();
    expect(plan(built, [1, 40], [101, 174])).toMatchObject({ cost: 3855 });
    built.graph.rebuild(
      built.state,
      new Map([
        [first(built.shaftIds), expressStops],
        [third(built.shaftIds), [90, 100]],
      ]),
    );
    expect(plan(built, [1, 40], [101, 174])).toBeNull();
  });

  it('C3: keeps maids on the service elevator and the stairs', () => {
    const built = towerC();
    expect(plan(built, [50, 207], [58, 230], 'maid')).toMatchObject({ cost: 564 });
    expect(plan(built, [50, 207], [45, 200], 'maid')).toMatchObject({ cost: 1140 });
    expect(plan(built, [50, 207], [40, 200], 'maid')).toBeNull();
  });
});

describe('limits at the boundary', () => {
  it('walks 3 stair floors and refuses a 4th', () => {
    const three = setup({ plan: tower(6, 0, 300), flights: flightsUp('stairs', 1, 4) });
    const four = setup({ plan: tower(6, 0, 300), flights: flightsUp('stairs', 1, 5) });
    expect(plan(three, [1, 100], [4, 100])).toMatchObject({ cost: 624 });
    expect(plan(four, [1, 100], [5, 100])).toBeNull();
  });

  it('walks 7 escalator floors and refuses 8', () => {
    const seven = setup({ plan: tower(10, 0, 300), flights: flightsUp('escalator', 1, 8) });
    const eight = setup({ plan: tower(10, 0, 300), flights: flightsUp('escalator', 1, 9) });
    expect(plan(seven, [1, 100], [8, 100])).toMatchObject({ cost: 56 });
    expect(plan(eight, [1, 100], [9, 100])).toBeNull();
  });

  it('counts stair and escalator floors separately', () => {
    const flights = [...flightsUp('escalator', 1, 8), ...flightsUp('stairs', 8, 11)];
    const built = setup({ plan: tower(12, 0, 300), flights });
    expect(plan(built, [1, 100], [11, 100])).toMatchObject({ cost: 7 * 8 + 3 * 8 + 600 });
  });

  it('takes 3 rides and refuses a 4th', () => {
    const built = setup({
      plan: tower(17, 0, 300, [
        { type: 'standard', x: 10, bottom: 1, top: 5 },
        { type: 'standard', x: 30, bottom: 5, top: 9 },
        { type: 'standard', x: 50, bottom: 9, top: 13 },
        { type: 'standard', x: 70, bottom: 13, top: 17 },
      ]),
    });
    expect(plan(built, [1, 100], [13, 100])).toMatchObject({ transportLegs: 3 });
    expect(plan(built, [1, 100], [17, 100])).toBeNull();
  });

  it('counts the rides already taken in the trip', () => {
    const built = setup({
      plan: tower(9, 0, 300, [{ type: 'standard', x: 10, bottom: 1, top: 9 }]),
    });
    const used = { stairFloors: 0, escalatorFloors: 0, rides: 3 };
    expect(plan(built, [1, 100], [9, 100], 'other', used)).toBeNull();
  });

  it('counts the stair floors already walked in the trip', () => {
    const built = setup({ plan: tower(6, 0, 300), flights: flightsUp('stairs', 1, 3) });
    const used = { stairFloors: 2, escalatorFloors: 0, rides: 0 };
    expect(plan(built, [1, 100], [3, 100], 'other', used)).toBeNull();
    expect(plan(built, [1, 100], [2, 100], 'other', used)).not.toBeNull();
  });
});

describe('who rides what', () => {
  it('never gives maids a passenger elevator', () => {
    const built = setup({
      plan: tower(6, 0, 300, [{ type: 'standard', x: 10, bottom: 1, top: 6 }]),
    });
    expect(plan(built, [1, 100], [6, 100], 'maid')).toBeNull();
    expect(plan(built, [1, 100], [6, 100], 'other')).not.toBeNull();
  });

  it('never gives other people the service elevator', () => {
    const built = setup({
      plan: tower(6, 0, 300, [{ type: 'service', x: 10, bottom: 1, top: 6 }]),
    });
    expect(plan(built, [1, 100], [6, 100], 'other')).toBeNull();
    expect(plan(built, [1, 100], [6, 100], 'maid')).not.toBeNull();
  });

  it('respects express stops', () => {
    const built = setup({
      plan: tower(40, 0, 300, [{ type: 'express', x: 10, bottom: 1, top: 30 }]),
      stops: (ids) => new Map([[first(ids), [1, 15, 30]]]),
    });
    expect(plan(built, [1, 100], [15, 100])).not.toBeNull();
    expect(plan(built, [1, 100], [20, 100])).toBeNull();
  });
});

describe('tie breaks and caching', () => {
  it('walks when the destination is on the same run', () => {
    const built = setup({ plan: tower(3, 0, 300), flights: NO_EXTRA_FLIGHTS });
    expect(plan(built, [2, 10], [2, 90])).toEqual({
      cost: 0,
      transportLegs: 0,
      columnsWalked: 80,
      firstLeg: null,
    });
  });

  it('breaks a full tie by the lower transport id', () => {
    const flights: Flight[] = [
      { type: 'stairs', x: 96, level: 1 },
      { type: 'stairs', x: 108, level: 1 },
    ];
    const built = setup({ plan: tower(3, 0, 300), flights });
    const route = plan(built, [1, 104], [2, 104]);
    expect(route?.firstLeg?.steps[0]?.via).toBe(Object.keys(built.state.transports)[0]);
  });

  it('gives the same answer from a warm cache as from a fresh planner', () => {
    const built = setup({
      plan: tower(9, 0, 300, [{ type: 'standard', x: 10, bottom: 1, top: 9 }]),
    });
    const first = plan(built, [1, 100], [9, 120]);
    expect(plan(built, [1, 100], [9, 120])).toEqual(first);
    const fresh = new TripPlanner(built.graph).plan(built.state, {
      from: { level: 1, x: 100 },
      to: { level: 9, x: 120 },
      userClass: 'other',
    });
    expect(fresh).toEqual(first);
  });

  it('drops cached routes when the graph is rebuilt', () => {
    const built = setup({
      plan: tower(9, 0, 300, [{ type: 'standard', x: 10, bottom: 1, top: 9 }]),
    });
    expect(plan(built, [1, 100], [9, 120])).not.toBeNull();
    Reflect.deleteProperty(built.state.shafts, first(built.shaftIds));
    built.graph.rebuild(built.state);
    expect(plan(built, [1, 100], [9, 120])).toBeNull();
  });
});

describe('no route', () => {
  it('retries a required trip after 720 steps and cancels an optional one', () => {
    expect(noRouteOutcome('required')).toEqual({ action: 'retry', afterSteps: 720 });
    expect(noRouteOutcome('optional')).toEqual({ action: 'cancel' });
  });

  it('reports the outcome of a trip with no route', () => {
    const built = setup({ plan: tower(3, 0, 300) });
    const result = built.planner.planTrip(built.state, {
      from: { level: 1, x: 20 },
      to: { level: 3, x: 10 },
      userClass: 'other',
      tripKind: 'optional',
    });
    expect(result).toEqual({ kind: 'no-route', outcome: { action: 'cancel' } });
  });
});
