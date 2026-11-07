import type { GridState, OccupantRef } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  addOccupant,
  cellsWithoutStructure,
  clearStructure,
  createGrid,
  isSpanFree,
  levelError,
  occupantAt,
  overlappingOccupants,
  removeOccupant,
  setStructure,
  spanError,
  structureAt,
} from './grid';

const office = (n: number): OccupantRef => ({ kind: 'unit', id: `u${n}` });

describe('grid bounds', () => {
  it('accepts the corner cells of the buildable grid', () => {
    expect(spanError(1, 0, 0)).toBeNull();
    expect(spanError(1, 374, 374)).toBeNull();
    expect(spanError(100, 0, 374)).toBeNull();
    expect(spanError(-9, 0, 374)).toBeNull();
    expect(spanError(104, 0, 374)).toBeNull();
  });

  it('rejects columns outside 0 to 374', () => {
    expect(spanError(1, -1, 3)).toBe('OUT_OF_BOUNDS');
    expect(spanError(1, 370, 375)).toBe('OUT_OF_BOUNDS');
    expect(spanError(1, 0.5, 3)).toBe('OUT_OF_BOUNDS');
  });

  it('reserves S10 and rejects levels off the grid', () => {
    expect(levelError(-10)).toBe('LEVEL_RESERVED');
    expect(levelError(0)).toBe('OUT_OF_BOUNDS');
    expect(levelError(-11)).toBe('OUT_OF_BOUNDS');
    expect(levelError(105)).toBe('OUT_OF_BOUNDS');
    expect(spanError(-10, 0, 0)).toBe('LEVEL_RESERVED');
  });

  it('rejects a reversed span', () => {
    expect(spanError(5, 10, 9)).toBe('INVALID_COMMAND');
  });

  it('refuses to write outside the grid', () => {
    const grid = createGrid();
    expect(() => setStructure(grid, -10, 0, 3, 'floor')).toThrow(RangeError);
    expect(() => setStructure(grid, 1, 372, 375, 'lobby')).toThrow(RangeError);
    expect(() => addOccupant(grid, 0, 0, 3, office(1))).toThrow(RangeError);
    expect(grid.levels).toEqual({});
  });
});

describe('structure spans', () => {
  it('starts empty', () => {
    const grid = createGrid();
    expect(structureAt(grid, 1, 0)).toBeNull();
    expect(cellsWithoutStructure(grid, 1, 0, 374)).toBe(375);
  });

  it('merges adjacent runs of the same kind', () => {
    const grid = createGrid();
    setStructure(grid, 2, 10, 19, 'floor');
    setStructure(grid, 2, 20, 29, 'floor');
    setStructure(grid, 2, 0, 9, 'floor');
    expect(grid.levels[2]?.structure).toEqual([{ kind: 'floor', x0: 0, x1: 29 }]);
  });

  it('keeps different kinds apart and splits a run it overwrites', () => {
    const grid = createGrid();
    setStructure(grid, 1, 0, 99, 'floor');
    setStructure(grid, 1, 40, 59, 'lobby');
    expect(grid.levels[1]?.structure).toEqual([
      { kind: 'floor', x0: 0, x1: 39 },
      { kind: 'lobby', x0: 40, x1: 59 },
      { kind: 'floor', x0: 60, x1: 99 },
    ]);
    expect(structureAt(grid, 1, 39)).toBe('floor');
    expect(structureAt(grid, 1, 40)).toBe('lobby');
    expect(structureAt(grid, 1, 100)).toBeNull();
  });

  it('counts the cells of a run that still need floor', () => {
    const grid = createGrid();
    setStructure(grid, 3, 5, 9, 'floor');
    setStructure(grid, 3, 20, 24, 'floor');
    expect(cellsWithoutStructure(grid, 3, 0, 29)).toBe(20);
    expect(cellsWithoutStructure(grid, 3, 5, 9)).toBe(0);
    expect(cellsWithoutStructure(grid, 3, 8, 21)).toBe(10);
  });

  it('clears part of a run and drops a level that becomes empty', () => {
    const grid = createGrid();
    setStructure(grid, -9, 0, 374, 'floor');
    clearStructure(grid, -9, 100, 199);
    expect(grid.levels[-9]?.structure).toEqual([
      { kind: 'floor', x0: 0, x1: 99 },
      { kind: 'floor', x0: 200, x1: 374 },
    ]);
    clearStructure(grid, -9, 0, 374);
    expect(grid.levels[-9]).toBeUndefined();
  });

  it('handles the edge columns and the top floor', () => {
    const grid = createGrid();
    setStructure(grid, 100, 0, 0, 'floor');
    setStructure(grid, 100, 374, 374, 'floor');
    expect(structureAt(grid, 100, 0)).toBe('floor');
    expect(structureAt(grid, 100, 1)).toBeNull();
    expect(structureAt(grid, 100, 374)).toBe('floor');
    expect(cellsWithoutStructure(grid, 100, 0, 374)).toBe(373);
  });
});

describe('occupancy index', () => {
  function gridWithOffices(): GridState {
    const grid = createGrid();
    addOccupant(grid, 5, 0, 8, office(1));
    addOccupant(grid, 5, 20, 28, office(2));
    addOccupant(grid, 5, 366, 374, office(3));
    return grid;
  }

  it('finds the occupant of a cell', () => {
    const grid = gridWithOffices();
    expect(occupantAt(grid, 5, 0)).toEqual(office(1));
    expect(occupantAt(grid, 5, 8)).toEqual(office(1));
    expect(occupantAt(grid, 5, 9)).toBeNull();
    expect(occupantAt(grid, 5, 374)).toEqual(office(3));
    expect(occupantAt(grid, 6, 0)).toBeNull();
  });

  it('returns every occupant that shares a cell with the query', () => {
    const grid = gridWithOffices();
    expect(overlappingOccupants(grid, 5, 8, 20).map((span) => span.occupant)).toEqual([
      office(1),
      office(2),
    ]);
    expect(overlappingOccupants(grid, 5, 9, 19)).toEqual([]);
    expect(overlappingOccupants(grid, 5, 374, 374).map((span) => span.occupant)).toEqual([
      office(3),
    ]);
  });

  it('treats touching spans as free', () => {
    const grid = gridWithOffices();
    expect(isSpanFree(grid, 5, 9, 19)).toBe(true);
    expect(isSpanFree(grid, 5, 9, 20)).toBe(false);
  });

  it('keeps occupants sorted whatever the insertion order', () => {
    const grid = gridWithOffices();
    addOccupant(grid, 5, 10, 18, office(4));
    expect(grid.levels[5]?.occupants.map((span) => span.x0)).toEqual([0, 10, 20, 366]);
  });

  it('refuses to stack two occupants on one cell', () => {
    const grid = gridWithOffices();
    expect(() => addOccupant(grid, 5, 28, 36, office(9))).toThrow(/already occupied/);
    expect(grid.levels[5]?.occupants).toHaveLength(3);
  });

  it('removes an occupant, frees its cells and keeps the others', () => {
    const grid = gridWithOffices();
    expect(removeOccupant(grid, 5, office(2))).toBe(9);
    expect(isSpanFree(grid, 5, 20, 28)).toBe(true);
    expect(occupantAt(grid, 5, 0)).toEqual(office(1));
    expect(removeOccupant(grid, 5, office(2))).toBe(0);
  });

  it('tells transport footprints and landings apart', () => {
    const grid = createGrid();
    const footprint: OccupantRef = { kind: 'transport', id: 't7', part: 'footprint' };
    const landing: OccupantRef = { kind: 'transport', id: 't7', part: 'landing' };
    addOccupant(grid, 2, 0, 7, footprint);
    addOccupant(grid, 2, 8, 9, landing);
    removeOccupant(grid, 2, landing);
    expect(occupantAt(grid, 2, 0)).toEqual(footprint);
    expect(occupantAt(grid, 2, 8)).toBeNull();
  });

  it('only looks at the occupants of the queried level', () => {
    const grid = createGrid();
    for (let level = 2; level <= 100; level += 1) {
      for (let x = 0; x + 8 <= 374; x += 9) {
        addOccupant(grid, level, x, x + 8, office(level * 1000 + x));
      }
    }
    addOccupant(grid, -9, 100, 129, { kind: 'shaft', id: 's1' });
    expect(overlappingOccupants(grid, -9, 0, 374)).toEqual([
      { x0: 100, x1: 129, occupant: { kind: 'shaft', id: 's1' } },
    ]);
    expect(overlappingOccupants(grid, 1, 0, 374)).toEqual([]);
  });

  it('drops a level once its last occupant and structure are gone', () => {
    const grid = createGrid();
    addOccupant(grid, 50, 0, 3, { kind: 'ruins' });
    removeOccupant(grid, 50, { kind: 'ruins' });
    expect(grid.levels[50]).toBeUndefined();
  });
});

describe('grid serialization', () => {
  it('survives a JSON round trip and keeps answering queries', () => {
    const grid = createGrid();
    setStructure(grid, 1, 0, 374, 'lobby');
    setStructure(grid, -9, 0, 50, 'floor');
    addOccupant(grid, -9, 0, 9, office(1));
    addOccupant(grid, 100, 360, 374, { kind: 'shaft', id: 's2' });

    const restored = JSON.parse(JSON.stringify(grid)) as GridState;
    expect(restored).toEqual(grid);
    expect(structureAt(restored, 1, 374)).toBe('lobby');
    expect(occupantAt(restored, -9, 9)).toEqual(office(1));
    expect(isSpanFree(restored, 100, 359, 359)).toBe(true);
    expect(isSpanFree(restored, 100, 359, 360)).toBe(false);
  });
});
