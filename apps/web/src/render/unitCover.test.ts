import { describe, expect, it } from 'vitest';
import { planStructureRow } from './structurePlan';
import { coveredRows } from './unitCover';

const WIDTH = 375;
const row = (from: number, to: number, cell: string): string =>
  '.'.repeat(from) + cell.repeat(to - from + 1) + '.'.repeat(WIDTH - to - 1);

describe('coveredRows', () => {
  it('marks the cells under a placed unit on its level', () => {
    const covered = coveredRows([{ type: 'office', x: 10, level: 5 }]);
    expect(covered.get(5)?.slice(9, 20)).toBe('.' + 'u'.repeat(9) + '.');
  });

  it('ignores stairs-like transports and structure', () => {
    expect(coveredRows([{ type: 'floor', x: 10, level: 5 }]).size).toBe(0);
  });
});

describe('floor under units', () => {
  it('draws no floor sprite under a unit but keeps the rest of the run', () => {
    const source = {
      row: (level: number) => (level === 5 ? row(10, 29, 'f') : undefined),
      mainLobbyHeight: null,
      covered: () => row(15, 19, 'u'),
    };
    const floors = planStructureRow(5, source).filter((piece) => piece.subject === 'floor');
    expect(floors.map((piece) => [piece.x, piece.width])).toEqual([
      [80, 40],
      [160, 80],
    ]);
  });
});
