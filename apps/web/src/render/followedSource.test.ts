import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import { bindFollowed } from './followedSource';

const ana = {
  id: 'p3',
  name: 'Ana',
  kind: 'resident' as const,
  level: 2,
  x: 5,
  stress: 'normal' as const,
};

describe('bindFollowed', () => {
  it('shows the ids of the followed people and updates when the list changes', () => {
    const store = new ClientStore({ requestResync: () => undefined, now: () => 0 });
    store.applySnapshot({ ...snapshot, followed: [ana] });
    const shown: string[][] = [];
    bindFollowed(store, (ids) => shown.push([...ids]));
    store.applySnapshot({ ...snapshot, followed: [] });
    expect(shown).toEqual([['p3'], []]);
  });
});
