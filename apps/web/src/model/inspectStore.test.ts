import { describe, expect, it, vi } from 'vitest';
import type { InspectData } from '@tower-magnate/shared';
import { InspectStore } from './inspectStore';

function unitData(id: string, name: string): InspectData {
  return { kind: 'unit', id, status: 'gone', name } as unknown as InspectData;
}

function receive(store: InspectStore, data: InspectData): void {
  store.receive({ v: 1, t: 'inspect', p: data });
}

function storeWithThreeUnits(): InspectStore {
  const store = new InspectStore();
  for (const id of ['u1', 'u2', 'u3']) {
    receive(store, unitData(id, id));
  }
  return store;
}

describe('inspect store anchored unit', () => {
  it('tells listeners when the anchored unit changes or clears, not when it repeats', () => {
    const store = new InspectStore();
    const listener = vi.fn();
    store.onAnchorChange(listener);
    store.anchorUnit('u1');
    store.anchorUnit('u1');
    expect(store.anchoredUnit()).toBe('u1');
    store.anchorUnit('u2');
    store.clearAnchor();
    store.clearAnchor();
    expect(store.anchoredUnit()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('inspect store with several unit windows', () => {
  it('keeps the latest data for each of three units', () => {
    const store = storeWithThreeUnits();
    receive(store, unitData('u2', 'u2 again'));
    expect(store.unit('u1')).toMatchObject({ name: 'u1' });
    expect(store.unit('u2')).toMatchObject({ name: 'u2 again' });
    expect(store.unit('u3')).toMatchObject({ name: 'u3' });
  });

  it('keeps routing to the others after the newest closes', () => {
    const store = storeWithThreeUnits();
    store.forget('u3');
    receive(store, unitData('u1', 'u1 new'));
    receive(store, unitData('u2', 'u2 new'));
    expect(store.unit('u3')).toBeUndefined();
    expect(store.unit('u1')).toMatchObject({ name: 'u1 new' });
    expect(store.unit('u2')).toMatchObject({ name: 'u2 new' });
  });

  it('keeps routing to the others after the oldest closes', () => {
    const store = storeWithThreeUnits();
    store.forget('u1');
    receive(store, unitData('u2', 'u2 new'));
    receive(store, unitData('u3', 'u3 new'));
    expect(store.unit('u1')).toBeUndefined();
    expect(store.unit('u2')).toMatchObject({ name: 'u2 new' });
    expect(store.unit('u3')).toMatchObject({ name: 'u3 new' });
  });

  it('notifies listeners once per result', () => {
    const store = storeWithThreeUnits();
    const listener = vi.fn();
    store.subscribe(listener);
    receive(store, unitData('u1', 'x'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('routes a result in under 1 ms with 5 windows', () => {
    const store = new InspectStore();
    for (let i = 0; i < 5; i += 1) {
      store.subscribe(() => undefined);
    }
    const started = performance.now();
    receive(store, unitData('u1', 'x'));
    expect(performance.now() - started).toBeLessThan(1);
  });
});

describe('inspect store with person windows', () => {
  const personData = (id: string, name: string | null): InspectData =>
    ({ kind: 'person', id, status: 'ok', name }) as unknown as InspectData;

  it('keeps the latest data per person and forgets a closed one', () => {
    const store = new InspectStore();
    receive(store, personData('p1', null));
    receive(store, personData('p2', 'Ana'));
    receive(store, personData('p1', 'Beto'));
    expect(store.person('p1')).toMatchObject({ name: 'Beto' });
    store.forgetPerson('p2');
    expect(store.person('p2')).toBeUndefined();
    expect(store.person('p1')).toMatchObject({ name: 'Beto' });
  });

  it('tells the subscribers and the window host', () => {
    const store = new InspectStore();
    const changed = vi.fn();
    const requested = vi.fn();
    store.subscribe(changed);
    store.onPersonWindowRequest(requested);
    receive(store, personData('p1', null));
    store.requestPersonWindow('p1');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(requested).toHaveBeenCalledWith('p1');
  });
});
