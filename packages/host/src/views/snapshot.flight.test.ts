import { createTower, setStructure, TREK_PHASES } from '@tower-magnate/engine';
import { ESCALATOR_FLIGHT_STEPS, SnapshotSchema, STAIR_FLIGHT_STEPS } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot';
import { addOfficeWorker } from './testPeople';

const VIEW = { levelFrom: 1, levelTo: 5, xFrom: 0, xTo: 50 };

function flightTower(phase: 'onStairs' | 'onEscalator', legLevel: number) {
  const state = createTower(7);
  setStructure(state.grid, 1, 0, 19, 'lobby');
  setStructure(state.grid, 2, 0, 19, 'floor');
  setStructure(state.grid, 3, 0, 19, 'floor');
  addOfficeWorker(state, { homeUnit: 5, level: 2, column: 4 });
  state.people.trek[0] = TREK_PHASES.indexOf(phase);
  state.people.trip[0] = 1;
  state.people.legLevel[0] = legLevel;
  return state;
}

describe('flight progress in the snapshot', () => {
  it('counts the steps spent on a stair flight and points up when the leg goes up', () => {
    const state = flightTower('onStairs', 3);
    state.step = 100;
    state.people.legStep[0] = 100 + STAIR_FLIGHT_STEPS;
    const snapshot = buildSnapshot(state, VIEW);
    expect(snapshot.people[0]?.flight).toEqual({ done: 0, steps: STAIR_FLIGHT_STEPS, up: true });

    state.step = 107;
    expect(buildSnapshot(state, VIEW).people[0]?.flight?.done).toBe(7);
    state.step = 111;
    const last = buildSnapshot(state, VIEW);
    expect(last.people[0]?.flight?.done).toBe(STAIR_FLIGHT_STEPS - 1);
    expect(SnapshotSchema.safeParse(last).success).toBe(true);
  });

  it('points down when the leg ends on a lower level and uses the escalator length', () => {
    const state = flightTower('onEscalator', 1);
    state.step = 50;
    state.people.legStep[0] = 50 + ESCALATOR_FLIGHT_STEPS - 2;
    expect(buildSnapshot(state, VIEW).people[0]?.flight).toEqual({
      done: 2,
      steps: ESCALATOR_FLIGHT_STEPS,
      up: false,
    });
  });

  it('leaves the flight out for people who are not on one', () => {
    const state = flightTower('onStairs', 3);
    state.people.trek[0] = TREK_PHASES.indexOf('walkingToDestination');
    expect(buildSnapshot(state, VIEW).people[0]).not.toHaveProperty('flight');
  });
});
