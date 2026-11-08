import { describe, expect, it, vi } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { delta, snapshot } from '../testing/protocolFixtures';
import { TOWER_WIDTH_TILES } from './metrics';
import {
  bindStructure,
  fullWidthTestTower,
  placeholderStructure,
  testTowerFromQuery,
} from './structureSource';
import type { StructureInput } from './structureRows';

describe('bindStructure', () => {
  it('shows the stand-in tower until the first snapshot, then the store', () => {
    const store = new ClientStore({ requestResync: () => {} });
    const shown: StructureInput[] = [];
    bindStructure(store, (input) => shown.push(input));
    expect(shown).toHaveLength(1);
    expect(shown[0]?.structure.get(1)).toContain('l');

    store.applySnapshot(snapshot);
    expect(shown).toHaveLength(2);
    expect(shown[1]?.structure.get(1)).toBe('l'.repeat(TOWER_WIDTH_TILES));
    expect(shown[1]?.structure.has(100)).toBe(false);
  });

  it('shows again only when a delta changes the structure', () => {
    const store = new ClientStore({ requestResync: () => {} });
    store.applySnapshot(snapshot);
    const shown: StructureInput[] = [];
    bindStructure(store, (input) => shown.push(input));
    store.applyDelta(delta({ step: 101 }));
    expect(shown).toHaveLength(1);
    const floorRow = '.'.repeat(10) + 'f'.repeat(TOWER_WIDTH_TILES - 10);
    store.applyDelta(delta({ step: 102, structure: [{ level: 2, structure: floorRow }] }));
    expect(shown).toHaveLength(2);
    expect(shown[1]?.structure.get(2)).toBe(floorRow);
  });

  it('stops after unsubscribing', () => {
    const store = new ClientStore({ requestResync: () => {} });
    const show = vi.fn();
    const stop = bindStructure(store, show);
    stop();
    store.applySnapshot(snapshot);
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('placeholderStructure', () => {
  it('turns the stand-in content into rows by level', () => {
    const { structure } = placeholderStructure();
    expect(structure.get(100)).toHaveLength(TOWER_WIDTH_TILES);
    expect(structure.has(0)).toBe(false);
  });
});

describe('fullWidthTestTower', () => {
  it('builds every column from S9 to the top floor, with no level 0', () => {
    const { structure, mainLobbyHeight } = fullWidthTestTower(100);
    expect(structure.size).toBe(109);
    expect(structure.has(0)).toBe(false);
    expect(structure.get(100)).toBe('f'.repeat(TOWER_WIDTH_TILES));
    expect(structure.get(2)).toBe('l'.repeat(TOWER_WIDTH_TILES));
    expect(mainLobbyHeight).toBe(3);
  });
});

describe('testTowerFromQuery', () => {
  it('reads a floor count from 1 to 104', () => {
    expect(testTowerFromQuery('?testTower=100')).toBe(100);
    expect(testTowerFromQuery('?testTower=0')).toBeNull();
    expect(testTowerFromQuery('?testTower=105')).toBeNull();
    expect(testTowerFromQuery('?stars=3')).toBeNull();
  });
});
