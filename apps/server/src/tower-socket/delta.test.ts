import { addPerson, createTower, setStructure } from '@tower-magnate/engine';
import {
  DeltaSchema,
  packPerson,
  serverMessage,
  type Snapshot,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { diffSnapshots, needsFreshSnapshot } from './delta';
import { buildSnapshot } from './snapshot';

const VIEW = { levelFrom: 1, levelTo: 3, xFrom: 0, xTo: 50 };

function tower(): TowerState {
  const state = createTower(3);
  setStructure(state.grid, 1, 0, 9, 'lobby');
  addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 3 });
  return state;
}

function snapshotOf(state: TowerState, viewport = VIEW): Snapshot {
  return buildSnapshot(state, viewport);
}

describe('delta between snapshots', () => {
  it('is quiet when only the step moved', () => {
    const before = snapshotOf(tower());
    const after = { ...before, step: before.step + 5 };

    const { delta, quiet } = diffSnapshots(before, after);

    expect(quiet).toBe(true);
    expect(delta).toEqual({ step: after.step, cars: [], people: before.people.map(packPerson) });
  });

  it('carries only the fields that changed', () => {
    const before = snapshotOf(tower());
    const after = { ...before, step: before.step + 1, money: before.money + 500 };

    const { delta, quiet } = diffSnapshots(before, after);

    expect(quiet).toBe(false);
    expect(delta.money).toBe(after.money);
    expect(delta).not.toHaveProperty('population');
    expect(delta).not.toHaveProperty('finances');
    expect(DeltaSchema.safeParse(delta).success).toBe(true);
  });

  it('is not quiet when a person moves', () => {
    const before = snapshotOf(tower());
    const after = structuredClone(before);
    after.people.forEach((person) => (person.x += 1));

    expect(diffSnapshots(before, after).quiet).toBe(false);
  });

  it('lists people who left the viewport', () => {
    const state = tower();
    const before = snapshotOf(state);
    const after = snapshotOf(state, { ...VIEW, xFrom: 20 });

    const { delta } = diffSnapshots(before, after);

    expect(delta.people).toEqual([]);
    expect(delta.peopleGone).toEqual(before.people.map((person) => person.id));
  });

  it('sends changed structure rows and upserted or removed units', () => {
    const state = tower();
    const before = snapshotOf(state);
    setStructure(state.grid, 2, 0, 19, 'floor');
    const after = snapshotOf(state);
    const unit = { ...after.units[0], id: 'u9', type: 'office' as const, x: 0, level: 2 };
    const withUnit = {
      ...after,
      units: [
        {
          ...unit,
          name: null,
          price: 'normal' as const,
          occupied: false,
          variant: 'empty' as const,
        },
      ],
    };

    const added = diffSnapshots(before, withUnit).delta;
    const removed = diffSnapshots(withUnit, after).delta;

    expect(added.structure).toEqual([{ level: 2, structure: after.grid.levels['2']?.structure }]);
    expect(added.unitsUpserted).toEqual(withUnit.units);
    expect(removed.unitsRemoved).toEqual(['u9']);
  });

  it('sends the lobby height only when it changes', () => {
    const before = snapshotOf(createTower(3));
    const built = { ...before, grid: { ...before.grid, mainLobbyHeight: 1 as const } };
    const raised = { ...built, grid: { ...built.grid, mainLobbyHeight: 2 as const } };

    expect(diffSnapshots(before, built).delta.mainLobbyHeight).toBe(1);
    expect(diffSnapshots(built, built).delta.mainLobbyHeight).toBeUndefined();
    expect(diffSnapshots(built, raised).delta.mainLobbyHeight).toBe(2);
  });

  it('keeps the same snapshot when only the lobby height changes', () => {
    const before = snapshotOf(tower());
    const after = { ...before, grid: { ...before.grid, mainLobbyHeight: 2 as const } };

    expect(needsFreshSnapshot(before, after)).toBe(false);
  });

  it('carries a new shaft and its cars, then drops a removed car', () => {
    const state = tower();
    const before = snapshotOf(state);
    const car = { homeLevel: 1, level: 1, riders: [], paid: 0, placedAtStep: 0 };
    state.shafts.s1 = {
      id: 's1',
      type: 'standard',
      x: 40,
      bottom: 1,
      top: 3,
      cars: [car, { ...car }],
      queues: {},
      paid: 0,
      placedAtStep: 0,
    };
    const withShaft = snapshotOf(state);

    const added = diffSnapshots(before, withShaft).delta;
    state.shafts.s1.cars.pop();
    const removed = diffSnapshots(withShaft, snapshotOf(state)).delta;

    expect(added.shaftsUpserted?.map((shaft) => shaft.id)).toEqual(['s1']);
    expect(added.cars.map(([, carIndex]) => carIndex)).toEqual([0, 1]);
    expect(DeltaSchema.safeParse(added).success).toBe(true);
    expect(removed.cars.map(([, carIndex]) => carIndex)).toEqual([0]);
  });

  it('frames a crowded delta of 250 people and 192 cars under 50 KB', () => {
    const state = createTower(40);
    for (let index = 0; index < 250; index += 1) {
      addPerson(state, {
        kind: 'officeWorker',
        homeUnit: index,
        level: 1 + (index % 40),
        column: 3 + (index % 90),
      });
    }
    const view = { levelFrom: 1, levelTo: 40, xFrom: 0, xTo: 200 };
    const before = snapshotOf(state, view);
    expect(before.people).toHaveLength(250);
    before.cars = Array.from({ length: 192 }, (_, index) => ({
      shaftId: `s${100 + (index % 24)}`,
      index: index % 8,
      position: 12.5 + index,
      direction: 'up',
      doors: 'open',
      load: 8,
    }));
    const after = structuredClone(before);
    after.step += 1;
    after.people.forEach((person) => (person.x += 0.25));
    after.cars.forEach((car) => (car.position += 0.5));

    const { delta } = diffSnapshots(before, after);
    const frame = JSON.stringify(serverMessage('delta', delta));

    expect(delta.people).toHaveLength(250);
    expect(delta.cars).toHaveLength(192);
    expect(Buffer.byteLength(frame)).toBeLessThan(50_000);
  });
});
