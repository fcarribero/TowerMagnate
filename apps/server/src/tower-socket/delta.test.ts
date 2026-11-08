import { addPerson, createTower, setStructure } from '@tower-magnate/engine';
import { DeltaSchema, type Snapshot, type TowerState } from '@tower-magnate/shared';
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
    expect(delta).toEqual({ step: after.step, cars: [], people: before.people });
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

  it('asks for a fresh snapshot when the lobby height changes', () => {
    const before = snapshotOf(tower());
    const after = { ...before, grid: { ...before.grid, mainLobbyHeight: 2 as const } };

    expect(needsFreshSnapshot(before, after)).toBe(true);
    expect(needsFreshSnapshot(before, before)).toBe(false);
  });
});
