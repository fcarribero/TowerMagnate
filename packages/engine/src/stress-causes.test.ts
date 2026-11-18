import {
  STRESS_NO_ROUTE,
  STRESS_QUEUE_FULL,
  STRESS_STAIR_FLOOR,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, slotOfPerson } from './people';
import { deserializeState, serializeState } from './serialization';
import { buildTower, plainTowerPlan } from './testing';
import {
  addAmbient,
  addFailedSearch,
  addFlight,
  addFullQueueEvent,
  fadeStressCausesHook,
  stressCausesOf,
} from './trip-ledger';

function fade(state: TowerState): void {
  fadeStressCausesHook.run({ state, events: [] }, { step: 0, dayNumber: 0, weekday: 0 });
}

function world(kind: 'officeWorker' | 'maid' = 'officeWorker') {
  const { state } = buildTower(plainTowerPlan(2, 0, 99));
  const id = addPerson(state, { kind, homeUnit: 0, level: 1, column: 10 });
  return { state, slot: slotOfPerson(state.people, id) };
}

describe('stress causes', () => {
  it('starts every new person with no causes', () => {
    const { state, slot } = world();
    expect(Object.values(stressCausesOf(state.people, slot)).every((value) => value === 0)).toBe(
      true,
    );
  });

  it('files each stress part under its cause, and calm apart as a positive amount', () => {
    const { state, slot } = world();
    const pool = state.people;
    addFlight(pool, slot, 'stairs');
    addFullQueueEvent(pool, slot);
    addFailedSearch(pool, slot);
    addAmbient(pool, slot, 3, 'walk');
    addAmbient(pool, slot, 2);
    addAmbient(pool, slot, -4);
    expect(stressCausesOf(pool, slot)).toMatchObject({
      stairs: STRESS_STAIR_FLOOR,
      queue: STRESS_QUEUE_FULL,
      noRoute: STRESS_NO_ROUTE,
      walk: 3,
      surroundings: 2,
      calm: 4,
      wait: 0,
      ride: 0,
    });
  });

  it('keeps no causes for workers who record no stress', () => {
    const { state, slot } = world('maid');
    addFlight(state.people, slot, 'stairs');
    expect(stressCausesOf(state.people, slot).stairs).toBe(0);
  });

  it('fades every cause each day, down to zero', () => {
    const { state, slot } = world();
    addFailedSearch(state.people, slot);
    addAmbient(state.people, slot, 1, 'walk');
    fade(state);
    expect(stressCausesOf(state.people, slot).noRoute).toBeCloseTo(STRESS_NO_ROUTE * 0.82, 1);
    expect(stressCausesOf(state.people, slot).walk).toBeCloseTo(0.82, 2);
    for (let day = 0; day < 5; day++) fade(state);
    expect(stressCausesOf(state.people, slot).walk).toBe(0);
  });

  it('keeps the causes through a save and restore, and reads old saves as none', () => {
    const { state, slot } = world();
    addFailedSearch(state.people, slot);
    const restored = deserializeState(serializeState(state));
    expect(stressCausesOf(restored.people, slot).noRoute).toBe(STRESS_NO_ROUTE);
    const old = JSON.parse(serializeState(state)) as { people: Record<string, unknown> };
    delete old.people.causeNoRoute;
    const fromOld = deserializeState(JSON.stringify(old));
    expect(stressCausesOf(fromOld.people, slot).noRoute).toBe(0);
  });
});
