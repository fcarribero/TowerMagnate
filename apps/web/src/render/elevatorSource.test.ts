import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { car, delta, snapshot } from '../testing/protocolFixtures';
import { bindShafts, carSourceOf } from './elevatorSource';

function storeAt(clock: { now: number }): ClientStore {
  const store = new ClientStore({ requestResync: () => {}, now: () => clock.now });
  store.applySnapshot(snapshot);
  return store;
}

describe('carSourceOf', () => {
  it('has nothing to draw before the first snapshot', () => {
    const store = new ClientStore({ requestResync: () => {} });
    expect(carSourceOf(store)()).toBeNull();
  });

  it('glides a car from the previous delta to the latest over one delta interval', () => {
    const clock = { now: 0 };
    const store = storeAt(clock);
    clock.now = 1000;
    store.applyDelta(delta({ step: 102, cars: [{ ...car, position: 12.5 }] }));
    const source = carSourceOf(store, () => clock.now + 100);
    expect(source()?.frame.cars.get('s4#0')?.position).toBe(11.5);
  });
});

describe('bindShafts', () => {
  it('shows the shafts of the snapshot and again only when they change', () => {
    const clock = { now: 0 };
    const store = storeAt(clock);
    const shown: string[][] = [];
    bindShafts(store, (shafts) => shown.push([...shafts].map((shaft) => shaft.id)));
    store.applyDelta(delta({ step: 102 }));
    expect(shown).toEqual([['s4']]);
    store.applyDelta(delta({ step: 103, shaftsRemoved: ['s4'] }));
    expect(shown).toEqual([['s4'], []]);
  });
});
