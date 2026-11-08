import { STRESS_NO_ROUTE, STRESS_WINDOW_STEPS, type TowerState } from '@tower-magnate/shared';
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
  hasPendingTrip,
  lobbyHeightAt,
  recordTrip,
  tripsOf,
} from './trip-ledger';

const engine = createEngine({
  commandHandlers: {},
  systems: [createTrekSystem(), createElevatorSystem()],
});

const SHAFT_COLUMN = 62;

function buildRideTower(): TowerState {
  const plan = {
    ...plainTowerPlan(6, 0, 99),
    shafts: [{ type: 'standard', x: 60, bottom: 1, top: 6 }],
  };
  return buildTower(plan as never).state;
}

function sendRider(state: TowerState, kind: 'officeWorker' | 'maid', toLevel: number): number {
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

describe('trip ledger', () => {
  it('records an elevator trip with its wait and ride when the person arrives', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const { state: arrived, waitSteps, rideSteps } = rideToArrival(state, id);

    const trips = tripsOf(arrived, id);
    expect(trips).toHaveLength(1);
    expect(trips[0]?.stress).toBe(waitSteps + rideSteps);
    expect(trips[0]?.endStep).toBe(arrived.step);
    expect(findPerson(arrived.people, id)?.stress).toBe(waitSteps + rideSteps);
  });

  it('keeps the trip stress in the person while the trip is under way', () => {
    const state = buildRideTower();
    const id = sendRider(state, 'officeWorker', 4);
    const waiting = engine.step(state, [], 3).state;
    expect(findPerson(waiting.people, id)?.stress).toBe(3);
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
    expect(tripsOf(waiting, id)).toEqual([{ endStep: waiting.step, stress: 3 + STRESS_NO_ROUTE }]);
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
