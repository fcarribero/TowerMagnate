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
