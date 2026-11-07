import { describe, expect, it, vi } from 'vitest';
import { TowerContentStore } from './towerContent';

const office = { id: 'u1', type: 'office', x: 200, level: 80 } as const;

describe('TowerContentStore', () => {
  it('replaces everything on a snapshot', () => {
    const store = new TowerContentStore();
    store.applyDelta({ unitsUpserted: [{ ...office, id: 'u9' }] });
    store.applySnapshot({ levels: { 1: { structure: 'l' } }, units: [office] });
    expect([...store.content.units.keys()]).toEqual(['u1']);
    expect(store.content.structure.get(1)).toBe('l');
  });

  it('applies built rows, new units and removals from a delta', () => {
    const store = new TowerContentStore();
    store.applySnapshot({ levels: {}, units: [office] });
    store.applyDelta({
      structure: [{ level: 80, structure: 'ff' }],
      unitsUpserted: [{ id: 'u2', type: 'condo', x: 10, level: 80 }],
      unitsRemoved: ['u1'],
    });
    expect(store.content.structure.get(80)).toBe('ff');
    expect([...store.content.units.keys()]).toEqual(['u2']);
  });

  it('tells listeners about changes and stays quiet for empty deltas', () => {
    const store = new TowerContentStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.applyDelta({});
    expect(listener).not.toHaveBeenCalled();
    store.applyDelta({ unitsUpserted: [office] });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.applyDelta({ unitsRemoved: ['u1'] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
