import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addOccupant, setStructure } from '../grid';
import { createTower } from '../state';
import { migrateState, StateMigrationError } from './index';

function builtTower(): TowerState {
  const tower = createTower(5);
  setStructure(tower.grid, 1, 0, 374, 'lobby');
  setStructure(tower.grid, -9, 10, 40, 'floor');
  setStructure(tower.grid, 100, 0, 20, 'floor');
  addOccupant(tower.grid, -9, 10, 39, { kind: 'shaft', id: 's2' });
  addOccupant(tower.grid, 100, 0, 8, { kind: 'unit', id: 'u3' });
  addOccupant(tower.grid, 100, 9, 16, { kind: 'transport', id: 't4', part: 'landing' });
  addOccupant(tower.grid, 100, 17, 20, { kind: 'ruins' });
  tower.grid.mainLobbyHeight = 2;
  tower.grid.skyLobbyHeights[15] = 3;
  return tower;
}

function savedWithGrid(grid: unknown): unknown {
  return { ...JSON.parse(JSON.stringify(createTower(5))), grid };
}

function savedWithRow(row: unknown): unknown {
  return savedWithGrid({ levels: { 5: row }, mainLobbyHeight: null, skyLobbyHeights: {} });
}

const floorRow = (spans: unknown[]) => ({ structure: spans, occupants: [] });

describe('migrateState grid', () => {
  it('round-trips a built grid through JSON', () => {
    const tower = builtTower();
    expect(migrateState(JSON.parse(JSON.stringify(tower)))).toEqual(tower);
  });

  it('gives a tower saved before the grid existed an empty grid', () => {
    const withoutGrid: Partial<TowerState> = createTower(5);
    delete withoutGrid.grid;
    expect(migrateState(withoutGrid).grid).toEqual(createTower(5).grid);
  });

  it('drops rows that hold nothing', () => {
    expect(migrateState(savedWithRow(floorRow([]))).grid.levels).toEqual({});
  });

  it('refuses levels off the grid', () => {
    const grid = { levels: { 0: floorRow([]) }, mainLobbyHeight: null, skyLobbyHeights: {} };
    expect(() => migrateState(savedWithGrid(grid))).toThrow(StateMigrationError);
    const above = { levels: { 105: floorRow([]) }, mainLobbyHeight: null, skyLobbyHeights: {} };
    expect(() => migrateState(savedWithGrid(above))).toThrow(StateMigrationError);
  });

  it('refuses spans outside the columns or reversed', () => {
    for (const span of [
      { kind: 'floor', x0: -1, x1: 3 },
      { kind: 'floor', x0: 370, x1: 375 },
      { kind: 'floor', x0: 8, x1: 2 },
      { kind: 'roof', x0: 0, x1: 3 },
    ]) {
      expect(() => migrateState(savedWithRow(floorRow([span])))).toThrow(StateMigrationError);
    }
  });

  it('refuses overlapping, unsorted or unmerged structure', () => {
    const overlapping = [
      { kind: 'floor', x0: 0, x1: 5 },
      { kind: 'lobby', x0: 5, x1: 9 },
    ];
    const unsorted = [
      { kind: 'floor', x0: 10, x1: 12 },
      { kind: 'lobby', x0: 0, x1: 3 },
    ];
    const unmerged = [
      { kind: 'floor', x0: 0, x1: 5 },
      { kind: 'floor', x0: 6, x1: 9 },
    ];
    for (const spans of [overlapping, unsorted, unmerged]) {
      expect(() => migrateState(savedWithRow(floorRow(spans)))).toThrow(StateMigrationError);
    }
  });

  it('loads stairs drawn over an office, which the engine allows', () => {
    const tower = createTower(5);
    setStructure(tower.grid, 2, 157, 235, 'floor');
    addOccupant(tower.grid, 2, 193, 201, { kind: 'unit', id: 'u5' });
    addOccupant(tower.grid, 2, 194, 201, { kind: 'transport', id: 't32', part: 'footprint' });
    const saved = JSON.parse(JSON.stringify(tower)) as unknown;
    expect(migrateState(saved).grid.levels[2]?.occupants).toHaveLength(2);
  });

  it('refuses two stairs or two shafts on the same cells', () => {
    const stairs = [
      { x0: 0, x1: 8, occupant: { kind: 'transport', id: 't1', part: 'footprint' } },
      { x0: 4, x1: 12, occupant: { kind: 'transport', id: 't2', part: 'footprint' } },
    ];
    expect(() => migrateState(savedWithRow({ structure: [], occupants: stairs }))).toThrow(
      StateMigrationError,
    );
  });

  it('refuses overlapping occupants and unknown occupant refs', () => {
    const office = { kind: 'unit', id: 'u1' };
    const overlapping = [
      { x0: 0, x1: 8, occupant: office },
      { x0: 8, x1: 16, occupant: { kind: 'unit', id: 'u2' } },
    ];
    expect(() => migrateState(savedWithRow({ structure: [], occupants: overlapping }))).toThrow(
      StateMigrationError,
    );
    for (const occupant of [
      { kind: 'unit', id: 1 },
      { kind: 'unit', id: '' },
      { kind: 'transport', id: 't1', part: 'roof' },
      { kind: 'tree' },
    ]) {
      const row = { structure: [], occupants: [{ x0: 0, x1: 3, occupant }] };
      expect(() => migrateState(savedWithRow(row))).toThrow(StateMigrationError);
    }
  });

  it('refuses bad lobby heights', () => {
    const levels = {};
    for (const heights of [
      { mainLobbyHeight: 4, skyLobbyHeights: {} },
      { mainLobbyHeight: null, skyLobbyHeights: { 16: 2 } },
      { mainLobbyHeight: null, skyLobbyHeights: { 30: 0 } },
    ]) {
      expect(() => migrateState(savedWithGrid({ levels, ...heights }))).toThrow(
        StateMigrationError,
      );
    }
  });
});
