import { describe, expect, it } from 'vitest';
import { joinQueue } from '../elevator-queues';
import { deserializeState, serializeState } from '../serialization';
import { plannedTripSteps } from '../trek';
import { accept, fullSiteTower, rejection } from './shaft-test-helpers';

const off = { type: 'setShaftEnabled', shaftId: 's1', enabled: false } as const;
const on = { type: 'setShaftEnabled', shaftId: 's1', enabled: true } as const;

function tower() {
  return fullSiteTower([{ type: 'standard', x: 40, bottom: 1, top: 10 }]);
}

describe('setShaftEnabled', () => {
  it('switches a shaft off for free: queues and pending calls go, riders stay', () => {
    const start = tower();
    const shaft = start.shafts.s1;
    const car = shaft?.cars[0];
    if (!shaft || !car) throw new Error('missing shaft');
    joinQueue(shaft, 4, 'up', 'p1', 8, 0);
    car.assigned = [{ level: 4, direction: 'up' }];
    car.trips = [{ person: 'p2', destination: 9 } as never];
    const { state, spent } = accept(start, off);
    expect(spent).toBe(0);
    expect(state.shafts.s1?.disabled).toBe(true);
    expect(state.shafts.s1?.queues).toEqual({});
    expect(state.shafts.s1?.cars[0]?.assigned).toEqual([]);
    expect(state.shafts.s1?.cars[0]?.trips).toHaveLength(1);
    expect(state.shafts.s1?.stops).toEqual(start.shafts.s1?.stops);
  });

  it('switches it back on, with the stops it had', () => {
    const { state } = accept(accept(tower(), off).state, on);
    expect(state.shafts.s1?.disabled).toBeUndefined();
    expect(state.shafts.s1?.stops).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('leaves no route through a disabled shaft', () => {
    const from = { level: 1, column: 30 };
    const to = { level: 8, column: 30 };
    const enabled = tower();
    expect(plannedTripSteps({ state: enabled, events: [] }, from, to)).not.toBeNull();
    const disabled = accept(enabled, off).state;
    expect(plannedTripSteps({ state: disabled, events: [] }, from, to)).toBeNull();
    const again = accept(disabled, on).state;
    expect(plannedTripSteps({ state: again, events: [] }, from, to)).not.toBeNull();
  });

  it('keeps the switch through a save and restore', () => {
    const { state } = accept(tower(), off);
    expect(deserializeState(serializeState(state)).shafts.s1?.disabled).toBe(true);
  });

  it('rejects an unknown shaft', () => {
    expect(rejection(tower(), { ...off, shaftId: 's9' })).toBe('UNKNOWN_ENTITY');
  });
});
