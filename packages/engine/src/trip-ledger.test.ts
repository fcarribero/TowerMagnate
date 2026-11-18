import {
  AMBIENT_WALK_COLUMNS_PER_STRESS,
  ELEVATOR_QUEUE_CAPACITY,
  FULL_QUEUE_RECHECK_STEPS,
  STRESS_NO_ROUTE,
  STRESS_QUEUE_FULL,
  STRESS_WINDOW_STEPS,
  type Level,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createElevatorSystem } from './elevators';
import { addPerson, findPerson, slotOfPerson } from './people';
import { TransportGraph } from './routing';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { cancelTrek, createTrekSystem, startTrek, trekPhaseAt } from './trek';
import {
  addFailedSearch,
  createNightReset,
  finishRide,
  stressCausesOf,
  hasPendingTrip,
  lobbyHeightAt,
  recordTrip,
  tripsOf,
} from './trip-ledger';

const engine = createEngine({
  commandHandlers: {},
  systems: [createTrekSystem(), createElevatorSystem()],
});

function stressTraceInOneCall(start: TowerState, id: number, steps: number): number[] {
  const trace: number[] = [];
  const tracing = createEngine({
    commandHandlers: {},
    systems: [
      createTrekSystem(),
      createElevatorSystem(),
      ({ state }) => trace.push(findPerson(state.people, id)?.stress ?? -1),
    ],
  });
  tracing.step(start, [], steps);
  return trace;
}

function stressTraceStepByStep(start: TowerState, id: number, steps: number): number[] {
  const trace: number[] = [];
  let state = start;
  for (let count = 0; count < steps; count++) {
    state = engine.step(state, [], 1).state;
    trace.push(findPerson(state.people, id)?.stress ?? -1);
  }
  return trace;
}

const walkingOnly = createEngine({ commandHandlers: {}, systems: [createTrekSystem()] });

const SHAFT_COLUMN = 62;

function upQueueAtLobby(state: TowerState) {
  const shaft = Object.values(state.shafts)[0] as Shaft;
  shaft.queues['1'] ??= { up: [], down: [] };
  return shaft.queues['1'];
}

function fillUpQueueAtLobby(state: TowerState): void {
  upQueueAtLobby(state).up = Array.from({ length: ELEVATOR_QUEUE_CAPACITY }, (_, index) => ({
    person: `p${9000 + index}`,
    destination: 4 as Level,
    joinedStep: 0,
  }));
}

function buildRideTower(): TowerState {
  const plan = {
    ...plainTowerPlan(6, 0, 99),
    shafts: [{ type: 'standard', x: 60, bottom: 1, top: 6 }],
  };
  return buildTower(plan as never).state;
}

function sendRider(
  state: TowerState,
  kind: 'officeWorker' | 'maid' | 'resident',
  toLevel: number,
): number {
  const id = addPerson(state, { kind, homeUnit: 0, level: 1, column: SHAFT_COLUMN });
  const context = { state, events: [], graph: new TransportGraph(state) };
  startTrek(context, slotOfPerson(state.people, id), { level: toLevel as never, column: 30 });
  return id;
}

interface Ride {
  state: TowerState;
  waitSteps: number;
  rideSteps: number;
}

function rideToArrival(start: TowerState, id: number): Ride {
  let state = start;
  let waitSteps = 0;
  let rideSteps = 0;
  for (let count = 0; count < 900; count++) {
    const result = engine.step(state, [], 1);
    state = result.state;
    for (const event of result.events) {
      if (event.type === 'rideFinished') {
        waitSteps += event.waitSteps;
        rideSteps += event.rideSteps;
      }
    }
    if (trekPhaseAt(state.people, slotOfPerson(state.people, id)) === 'idle') break;
  }
  return { state, waitSteps, rideSteps };
}

/** Office workers do not mind the 30 columns they walk after getting off; a minute of calm may give back a little. */
const WALK_CELLS = 0;
/** A resident minds them: 1 per 3 columns. */
const RESIDENT_WALK_CELLS = 30 / AMBIENT_WALK_COLUMNS_PER_STRESS;
const CALM_SLACK = 6;

function expectNearWalk(actual: number | undefined, base: number): void {
  expect(actual).toBeGreaterThanOrEqual(base + WALK_CELLS - CALM_SLACK);
  expect(actual).toBeLessThanOrEqual(base + WALK_CELLS + CALM_SLACK);
}

describe('trip ledger', () => {
  it('records an elevator trip with its wait and ride when the person arrives', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const { state: arrived, waitSteps, rideSteps } = rideToArrival(state, id);

    const trips = tripsOf(arrived, id);
    expect(trips).toHaveLength(1);
    expectNearWalk(trips[0]?.stress, waitSteps + rideSteps);
    expect(trips[0]?.endStep).toBe(arrived.step);
    expectNearWalk(findPerson(arrived.people, id)?.stress, waitSteps + rideSteps);
  });

  it('keeps the trip stress in the person while the trip is under way', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const waiting = engine.step(state, [], 3).state;
    // 2 steps of wait, then a step in the car, which counts nothing until the ride ends.
    expect(findPerson(waiting.people, id)?.stress).toBe(2);
  });

  it('adds the walk after the ride for a resident, who minds walking', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'resident', 4);
    const { state: arrived, waitSteps, rideSteps } = rideToArrival(state, id);
    const stress = tripsOf(arrived, id)[0]?.stress ?? 0;
    expect(stress).toBeGreaterThanOrEqual(waitSteps + rideSteps + RESIDENT_WALK_CELLS - CALM_SLACK);
    expect(stress).toBeLessThanOrEqual(waitSteps + rideSteps + RESIDENT_WALK_CELLS + CALM_SLACK);
  });

  it('keeps the stress of a waiting and riding person exact within one long step call', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'resident', 4);
    state.tripLedger[String(id)] = [state.step, 7];
    const inOneCall = stressTraceInOneCall(state, id, 40);
    expect(inOneCall).toEqual(stressTraceStepByStep(state, id, 40));
    expect(new Set(inOneCall).size).toBeGreaterThan(3);
  });

  it('drops a trip that leaves the week window while the person waits', () => {
    const state = buildRideTower();
    state.step = STRESS_WINDOW_STEPS + 100;
    const id = sendRider(state, 'officeWorker', 4);
    state.tripLedger[String(id)] = [state.step - STRESS_WINDOW_STEPS + 2, 300];
    const inOneCall = stressTraceInOneCall(state, id, 6);
    expect(inOneCall).toEqual(stressTraceStepByStep(state, id, 6));
    expect(inOneCall.at(-1)).toBeLessThan(10);
  });

  it('counts one full-queue event and the time beside the full queue as wait', () => {
    const state = buildRideTower();
    fillUpQueueAtLobby(state);
    const id = sendRider(state, 'officeWorker', 4);
    const arrivedAtShaft = state.step;
    const rechecks = 3;
    const beside = walkingOnly.step(state, [], rechecks * FULL_QUEUE_RECHECK_STEPS).state;
    const slot = slotOfPerson(beside.people, id);
    expect(trekPhaseAt(beside.people, slot)).toBe('waitingBesideQueue');
    const besideSteps = rechecks * FULL_QUEUE_RECHECK_STEPS;
    const besideStress = findPerson(beside.people, id)?.stress ?? 0;
    expect(Math.abs(besideStress - (STRESS_QUEUE_FULL + besideSteps))).toBeLessThanOrEqual(
      CALM_SLACK,
    );

    upQueueAtLobby(beside).up = [];
    let joined = beside;
    while (trekPhaseAt(joined.people, slot) !== 'queued') {
      joined = walkingOnly.step(joined, [], 1).state;
    }
    const waitBeforeQueue = joined.step - arrivedAtShaft;
    expect(waitBeforeQueue).toBe((rechecks + 1) * FULL_QUEUE_RECHECK_STEPS);

    const { state: arrived, waitSteps, rideSteps } = rideToArrival(joined, id);
    const base = STRESS_QUEUE_FULL + waitBeforeQueue + waitSteps + rideSteps;
    const stresses = tripsOf(arrived, id).map((trip) => trip.stress);
    expect(stresses).toHaveLength(1);
    expectNearWalk(stresses[0], base);
  });

  it('keeps the wait beside a full queue when the trip ends there', () => {
    const state = buildRideTower();
    fillUpQueueAtLobby(state);
    const id = sendRider(state, 'officeWorker', 4);
    const beside = walkingOnly.step(state, [], 4).state;
    cancelTrek({ state: beside, events: [] }, slotOfPerson(beside.people, id));
    expect(tripsOf(beside, id).map((trip) => trip.stress)).toEqual([STRESS_QUEUE_FULL + 4]);
  });

  it('starts the next trip from zero', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const { state: arrived } = rideToArrival(state, id);
    const slot = slotOfPerson(arrived.people, id);
    expect(arrived.people.tripSum[slot]).toBe(0);
    expect(arrived.people.tripSlowFloors[slot]).toBe(0);
  });

  it('records nothing for maids and guards', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'maid', 4);
    const { state: arrived } = rideToArrival(state, id);
    expect(tripsOf(arrived, id)).toEqual([]);
    expect(findPerson(arrived.people, id)?.stress).toBe(0);
  });

  it('counts only trips of the last week', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const { state: arrived } = rideToArrival(state, id);
    arrived.step += STRESS_WINDOW_STEPS + 1;
    const slot = slotOfPerson(arrived.people, id);
    addFailedSearch(arrived.people, slot);
    recordTrip(arrived, slot);
    expect(tripsOf(arrived, id).map((trip) => trip.stress)).toEqual([STRESS_NO_ROUTE]);
  });

  it('records a trip cut short with what it has, plus one failed attempt at the night reset', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const waiting = engine.step(state, [], 3).state;
    const slot = slotOfPerson(waiting.people, id);
    const context = { state: waiting, events: [] };
    cancelTrek(context, slot, { nightReset: true });
    // The 2 steps of wait count; the step already in the car counts nothing.
    expect(tripsOf(waiting, id)).toEqual([{ endStep: waiting.step, stress: 2 + STRESS_NO_ROUTE }]);
    expect(trekPhaseAt(waiting.people, slot)).toBe('idle');
  });

  it('caps a trip at 540 steps', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const slot = slotOfPerson(state.people, id);
    cancelTrek({ state, events: [] }, slot);
    addFailedSearch(state.people, slot);
    addFailedSearch(state.people, slot);
    recordTrip(state, slot);
    expect(tripsOf(state, id).at(-1)?.stress).toBe(540);
  });

  it('gives a pending trip a failed attempt at 03:00 and leaves idle people alone', () => {
    const state = buildRideTower();
    const stranded = addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 5 });
    const calm = addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 6 });
    addFailedSearch(state.people, slotOfPerson(state.people, stranded));
    const hook = createNightReset(cancelTrek, () => false);
    hook.run({ state, events: [] }, { step: state.step, weekday: 0 } as never);

    expect(tripsOf(state, stranded).map((trip) => trip.stress)).toEqual([540]);
    expect(tripsOf(state, calm)).toEqual([]);
    expect(hasPendingTrip(state.people, slotOfPerson(state.people, stranded))).toBe(false);
  });

  it('forgets the trips of a removed person', async () => {
    const { removePerson } = await import('./people');
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const { state: arrived } = rideToArrival(state, id);
    removePerson(arrived, id);
    expect(arrived.tripLedger).toEqual({});
  });
});

describe('lobby height at a cell', () => {
  it('is null outside a lobby and the lobby height on its cells', () => {
    const state = buildRideTower();
    expect(lobbyHeightAt(state.grid, 1, SHAFT_COLUMN)).toBe(state.grid.mainLobbyHeight);
    expect(lobbyHeightAt(state.grid, 3, SHAFT_COLUMN)).toBeNull();
  });
});

describe('stress of a ride', () => {
  function rider(stops: number[], type: Shaft['type'] = 'standard') {
    const { state } = buildTower({ ...plainTowerPlan(40, 0, 60) });
    const id = addPerson(state, {
      kind: 'officeWorker',
      homeUnit: 0,
      level: 1 as Level,
      column: 5,
    });
    const slot = slotOfPerson(state.people, id);
    state.step = 1_000;
    state.people.tripPartStep[slot] = 800;
    const shaft = { type, stops } as unknown as Shaft;
    return { state, slot, shaft };
  }

  it('is nothing on a car that goes straight to the floor, however long the ride takes', () => {
    const { state, slot, shaft } = rider([1, 30]);
    finishRide(state, slot, shaft, 30 as Level);
    expect(state.people.tripSum[slot]).toBe(0);
    expect(state.people.tripSlowFloors[slot]).toBe(0);
    expect(stressCausesOf(state.people, slot).ride).toBe(0);
  });

  it('is 5 for each enabled stop the car passes, which also count toward the long-trip extra', () => {
    const { state, slot, shaft } = rider([1, 3, 5, 9, 12, 30, 35]);
    finishRide(state, slot, shaft, 30 as Level);
    expect(state.people.tripSum[slot]).toBe(4 * 5);
    expect(state.people.tripSlowFloors[slot]).toBe(4);
    expect(stressCausesOf(state.people, slot).ride).toBe(20);
  });

  it('counts the stops passed going down too, and none toward the extra on an express', () => {
    const { state, slot, shaft } = rider([1, 15, 30], 'express');
    state.people.level[slot] = 30;
    finishRide(state, slot, shaft, 1 as Level);
    expect(state.people.tripSum[slot]).toBe(5);
    expect(state.people.tripSlowFloors[slot]).toBe(0);
  });
});
