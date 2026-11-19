import type { Level, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addPerson, slotOfPerson } from './people';
import { TransportGraph } from './routing';
import { buildTower, plainTowerPlan, type PlannedShaft } from './testing';
import { plannedPath, startTrek } from './trek';

const shaft: PlannedShaft = { type: 'standard', x: 60, bottom: 1, top: 6 };
const SHAFT_COLUMN = 62;

function buildRideTower(): TowerState {
  return buildTower({ ...plainTowerPlan(6, 0, 99), shafts: [shaft] }).state;
}

function send(
  state: TowerState,
  from: { level: Level; column: number },
  to: { level: Level; column: number },
): number {
  const id = addPerson(state, { kind: 'officeWorker', homeUnit: 0, ...from });
  const slot = slotOfPerson(state.people, id);
  startTrek({ state, events: [], graph: new TransportGraph(state) }, slot, to);
  return slot;
}

describe('plannedPath', () => {
  it('is empty for a person who is not on a trip', () => {
    const state = buildRideTower();
    const id = addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 10 });
    expect(plannedPath(state, slotOfPerson(state.people, id))).toEqual([]);
  });

  it('walks straight to a destination on the same floor', () => {
    const state = buildRideTower();
    const slot = send(state, { level: 2, column: 10 }, { level: 2, column: 40 });
    expect(plannedPath(state, slot)).toEqual([
      { level: 2, column: 10 },
      { level: 2, column: 40 },
    ]);
  });

  it('goes to the shaft, rides up its column and walks on to the destination', () => {
    const state = buildRideTower();
    const slot = send(state, { level: 1, column: 20 }, { level: 4, column: 30 });
    const path = plannedPath(state, slot);
    expect(path[0]).toEqual({ level: 1, column: 20 });
    expect(path.at(-1)).toEqual({ level: 4, column: 30 });
    const atShaft = path.filter((place) => place.column === SHAFT_COLUMN);
    expect(atShaft.map((place) => place.level)).toEqual([1, 4]);
  });
});
