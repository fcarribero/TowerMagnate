import type { TowerState } from '@tower-magnate/shared';
import { addPeopleForUnit } from '../people';
import { createTower } from '../state';
import { newUnit } from '../units';
import { medianOf } from './fastest-run';
import { deserializeState, serializeState } from '../serialization';

export const SNAPSHOT_PEOPLE = 20_000;
export const SNAPSHOT_BUDGET_MS = 1_000;
export const SNAPSHOT_RUNS = 5;

const OFFICE_WORKERS = 6;

/** Offices of 6 workers each, then one double room of 2 guests: exactly `people` people. */
export function towerWithPeople(people: number): TowerState {
  const state = createTower(20270218);
  const offices = Math.floor(people / OFFICE_WORKERS);
  for (let index = 1; index <= offices; index++) {
    const id = `u${index}`;
    state.units[id] = newUnit(id, 'office', 0, 2);
    addPeopleForUnit(state, id);
  }
  const roomId = `u${offices + 1}`;
  state.units[roomId] = newUnit(roomId, 'double-room', 0, 3);
  addPeopleForUnit(state, roomId);
  return state;
}

export interface SnapshotTimings {
  serializeMs: number;
  restoreMs: number;
  bytes: number;
}

/** Median serialize and restore times over `runs` runs. */
export function timeSnapshot(state: TowerState, runs = SNAPSHOT_RUNS): SnapshotTimings {
  const serializeTimes: number[] = [];
  const restoreTimes: number[] = [];
  let bytes = 0;
  for (let run = 0; run < runs; run++) {
    const serializeStarted = performance.now();
    const text = serializeState(state);
    serializeTimes.push(performance.now() - serializeStarted);
    bytes = text.length;
    const restoreStarted = performance.now();
    deserializeState(text);
    restoreTimes.push(performance.now() - restoreStarted);
  }
  return { serializeMs: medianOf(serializeTimes), restoreMs: medianOf(restoreTimes), bytes };
}
