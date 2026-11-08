import type { Level } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { StructureRows, changedLevels, type StructureInput } from './structureRows';
import type { StructurePiece } from './structurePlan';

const WIDTH = 375;

function filled(from: number, to: number, cell: string, base = '.'.repeat(WIDTH)): string {
  const chars = [...base];
  for (let column = from; column <= to; column += 1) {
    chars[column] = cell;
  }
  return chars.join('');
}

function input(rows: [Level, string][], mainLobbyHeight: 1 | 2 | 3 | null = 2): StructureInput {
  return { structure: new Map(rows), mainLobbyHeight };
}

function recorder(): { rows: StructureRows; drawn: Map<Level, StructurePiece[]> } {
  const drawn = new Map<Level, StructurePiece[]>();
  return { rows: new StructureRows((level, pieces) => drawn.set(level, pieces)), drawn };
}

describe('StructureRows', () => {
  it('draws every level except 0 on the first update', () => {
    const { rows, drawn } = recorder();
    rows.update(input([]));
    expect(drawn.size).toBe(114);
    expect(drawn.has(0)).toBe(false);
  });

  it('matches a fresh snapshot after build and demolish deltas', () => {
    const lobby = filled(100, 159, 'l');
    const start = input([
      [1, lobby],
      [2, lobby],
    ]);
    const { rows, drawn } = recorder();
    rows.update(start);

    const built = new Map(start.structure);
    built.set(3, filled(100, 139, 'f'));
    built.set(4, filled(100, 119, 'f'));
    built.set(-1, filled(100, 159, 'f'));
    rows.update({ ...start, structure: built });

    const demolished = new Map(built);
    demolished.set(4, filled(100, 109, 'f'));
    demolished.delete(-1);
    const end = { ...start, structure: demolished };
    const redrawn = rows.update(end);

    const fresh = recorder();
    fresh.rows.update(end);
    expect(drawn).toEqual(fresh.drawn);
    expect(redrawn).toEqual([-1, 1, 3, 4]);
  });
});

describe('changedLevels', () => {
  it('is empty when nothing changed', () => {
    const same = input([[5, filled(0, 9, 'f')]]);
    expect(changedLevels(same, { ...same })).toEqual([]);
  });

  it('redraws the main lobby rows when its height arrives', () => {
    const lobby = filled(0, 9, 'l');
    const before = input([[1, lobby]], null);
    expect(changedLevels(before, { ...before, mainLobbyHeight: 3 })).toEqual([1, 2, 3]);
  });
});
