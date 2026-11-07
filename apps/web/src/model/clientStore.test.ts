import { serverMessage } from '@tower-magnate/shared';
import { describe, expect, it, vi } from 'vitest';
import { delta, office, snapshot } from '../testing/protocolFixtures';
import { ClientStore, shallowEqual } from './clientStore';

function setup() {
  const requestResync = vi.fn();
  const store = new ClientStore({ requestResync });
  return { store, requestResync };
}

describe('ClientStore', () => {
  it('ignores deltas until the first snapshot arrives', () => {
    const { store, requestResync } = setup();
    store.receive(serverMessage('delta', delta()));
    expect(store.current).toBeNull();
    expect(requestResync).not.toHaveBeenCalled();
  });

  it('keeps the two latest states', () => {
    const { store } = setup();
    store.receive(serverMessage('snapshot', snapshot));
    store.receive(serverMessage('delta', delta({ step: 101 })));
    store.receive(serverMessage('delta', delta({ step: 103 })));
    expect(store.current?.previous?.step).toBe(101);
    expect(store.current?.latest.step).toBe(103);
  });

  it('asks for a resync when a delta is older than the last applied step', () => {
    const { store, requestResync } = setup();
    store.applySnapshot(snapshot);
    store.applyDelta(delta({ step: 105 }));
    store.applyDelta(delta({ step: 104, money: 1 }));
    expect(requestResync).toHaveBeenCalledWith('staleDelta');
    expect(store.current?.latest.step).toBe(105);
  });

  it('drops deltas while waiting for the resync snapshot, then starts over from it', () => {
    const { store, requestResync } = setup();
    store.applySnapshot(snapshot);
    store.reconnected();
    store.applyDelta(delta({ step: 200, money: 1 }));
    expect(requestResync).toHaveBeenCalledTimes(1);
    expect(requestResync).toHaveBeenCalledWith('reconnect');
    expect(store.current?.latest.money).toBe(snapshot.money);

    store.applySnapshot({ ...snapshot, step: 300, units: [] });
    expect(store.current?.previous).toBeNull();
    expect(store.current?.latest.units.size).toBe(0);
    store.applyDelta(delta({ step: 301 }));
    expect(store.current?.latest.step).toBe(301);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.applySnapshot(snapshot);
    unsubscribe();
    store.applyDelta(delta());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('calls a selector listener only when the selected value changes', () => {
    const { store } = setup();
    store.applySnapshot(snapshot);
    const listener = vi.fn();
    store.select((state) => ({ money: state.money, stars: state.stars }), listener);
    store.applyDelta(delta({ step: 101 }));
    store.applyDelta(delta({ step: 102, money: 10 }));
    expect(listener.mock.calls).toEqual([
      [{ money: snapshot.money, stars: 1 }],
      [{ money: 10, stars: 1 }],
    ]);
  });

  it('keeps unchanged collections by reference so selectors can skip work', () => {
    const { store } = setup();
    store.applySnapshot(snapshot);
    const listener = vi.fn();
    store.select((state) => state.units, listener);
    store.applyDelta(delta({ step: 101 }));
    store.applyDelta(delta({ step: 102, unitsRemoved: [office.id] }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('shallowEqual', () => {
  it('compares plain objects one level deep', () => {
    const units = new Map();
    expect(shallowEqual({ a: 1, units }, { a: 1, units })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual(new Map(), new Map())).toBe(false);
  });
});
