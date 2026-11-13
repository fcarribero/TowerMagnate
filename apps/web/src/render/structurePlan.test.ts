import { describe, expect, it } from 'vitest';
import {
  levelsAffectedBy,
  planStructureRow,
  soilSubject,
  type LobbyHeight,
  type StructurePiece,
  type StructureSource,
} from './structurePlan';

const WIDTH = 375;

function row(cells: Record<number, string>): string {
  const chars = Array.from({ length: WIDTH }, () => '.');
  for (const [column, cell] of Object.entries(cells)) {
    chars[Number(column)] = cell;
  }
  return chars.join('');
}

function span(from: number, to: number, cell: string): Record<number, string> {
  const cells: Record<number, string> = {};
  for (let column = from; column <= to; column += 1) {
    cells[column] = cell;
  }
  return cells;
}

function source(
  rows: Record<number, string>,
  mainLobbyHeight: LobbyHeight | null = null,
): StructureSource {
  return { row: (level) => rows[level], mainLobbyHeight };
}

function subjects(pieces: StructurePiece[]): string[] {
  return pieces.map((piece) => piece.subject);
}

describe('soilSubject', () => {
  it('gives each level from S1 to S9 its own picture', () => {
    expect([-1, -2, -3, -4, -6, -7, -8, -9].map(soilSubject)).toEqual([
      'soil-1',
      'soil-2',
      'soil-3',
      'soil-4',
      'soil-6',
      'soil-7',
      'soil-8',
      'soil-9',
    ]);
  });
});

describe('planStructureRow', () => {
  it('draws nothing for level 0 or an empty level above ground', () => {
    expect(planStructureRow(0, source({ 0: row(span(0, 10, 'f')) }))).toEqual([]);
    expect(planStructureRow(5, source({}))).toEqual([]);
  });

  it('fills a floor run with one repeated tile and walls on both sides', () => {
    const pieces = planStructureRow(3, source({ 3: row(span(10, 19, 'f')) }));
    expect(pieces).toContainEqual({ subject: 'floor', x: 80, y: 0, width: 80 });
    expect(pieces).toContainEqual({ subject: 'edge-left', x: 77, y: 0 });
    expect(pieces).toContainEqual({ subject: 'edge-right', x: 160, y: 0 });
  });

  it('draws ruins in place of floor and in basements', () => {
    const above = planStructureRow(
      3,
      source({ 3: row({ ...span(10, 14, 'f'), ...span(15, 16, 'r') }) }),
    );
    expect(above).toContainEqual({ subject: 'floor', x: 80, y: 0, width: 40 });
    expect(above).toContainEqual({ subject: 'ruins', x: 120, y: 0, width: 16 });
    const below = planStructureRow(-3, source({ '-3': row(span(5, 6, 'r')) }));
    expect(below).toContainEqual({ subject: 'ruins', x: 40, y: 0, width: 16 });
  });

  it('puts a roof only over columns with nothing above', () => {
    const pieces = planStructureRow(
      3,
      source({ 3: row(span(10, 19, 'f')), 4: row(span(10, 14, 'f')) }),
    );
    const roofs = pieces.filter((piece) => piece.subject === 'roof');
    expect(roofs).toEqual([{ subject: 'roof', x: 120, y: -4, width: 40 }]);
  });

  it('puts rooftop props only on free roof columns, standing on the parapet', () => {
    const rows = { 3: row(span(10, 49, 'f')), 4: row(span(10, 24, 'f')) };
    const props = (rowsIn: Record<number, string>): StructurePiece[] =>
      planStructureRow(3, source(rowsIn)).filter((piece) => piece.subject.startsWith('rooftop/'));
    const free = props(rows);
    expect(free.length).toBeGreaterThan(0);
    for (const piece of free) {
      expect(piece.x).toBeGreaterThanOrEqual(25 * 8);
      expect(piece.y).toBe(-4);
      expect(piece.anchorBottom).toBe(true);
    }
    const covered = props({ ...rows, 4: row(span(10, 49, 'f')) });
    expect(covered).toEqual([]);
  });

  it('carries the exterior wall up to the waist above the roof, only on outer ends', () => {
    const rows = { 3: row(span(10, 49, 'f')), 4: row(span(10, 24, 'f')) };
    const parapets = planStructureRow(3, source(rows)).filter((piece) =>
      piece.subject.startsWith('parapet-'),
    );
    expect(parapets).toEqual([{ subject: 'parapet-right', x: 400, y: -12 }]);
    const open = planStructureRow(3, source({ 3: row(span(10, 49, 'f')) }));
    expect(
      open.filter((piece) => piece.subject.startsWith('parapet-')).map((piece) => piece.subject),
    ).toEqual(['parapet-left', 'parapet-right']);
  });

  it('gives ruins no rooftop props', () => {
    const pieces = planStructureRow(3, source({ 3: row(span(10, 49, 'r')) }));
    expect(pieces.some((piece) => piece.subject.startsWith('rooftop/'))).toBe(false);
  });

  it('draws the main lobby as one tall sprite from level 1', () => {
    const lobby = row(span(8, 15, 'l'));
    const rows = { 1: lobby, 2: lobby, 3: lobby };
    const pieces = planStructureRow(1, source(rows, 3));
    expect(pieces).toContainEqual({ subject: 'lobby-3-wall', x: 64, y: -64, width: 64 });
    expect(subjects(pieces)).not.toContain('lobby-3');
    expect(subjects(pieces).some((subject) => subject.endsWith('-column'))).toBe(false);
    expect(pieces).toContainEqual({ subject: 'roof', x: 64, y: -68, width: 64 });
  });

  it('puts a door at each end of the main lobby, standing on the floor', () => {
    const lobby = row(span(8, 23, 'l'));
    const doors = planStructureRow(1, source({ 1: lobby })).filter(
      (piece) => piece.subject.startsWith('lobby-door'),
    );
    expect(doors).toEqual([
      { subject: 'lobby-door-left', x: 64, y: 29, anchorBottom: true },
      { subject: 'lobby-door-right', x: 176, y: 29, anchorBottom: true },
    ]);
    const narrow = planStructureRow(1, source({ 1: row(span(8, 10, 'l')) }));
    expect(narrow.some((piece) => piece.subject.startsWith('lobby-door'))).toBe(false);
  });

  it('leaves the upper rows of a tall main lobby empty', () => {
    const lobby = row(span(8, 15, 'l'));
    const rows = { 1: lobby, 2: lobby, 3: lobby };
    expect(planStructureRow(2, source(rows, 3))).toEqual([]);
    expect(planStructureRow(3, source(rows, 3))).toEqual([]);
  });

  it('draws sky lobbies with the sky lobby sprite', () => {
    const pieces = planStructureRow(15, source({ 15: row(span(4, 7, 'l')) }));
    expect(subjects(pieces)).toContain('sky-lobby');
    expect(subjects(pieces).some((subject) => subject.endsWith('-column'))).toBe(false);
  });

  const lobbyProps = (pieces: StructurePiece[]): StructurePiece[] =>
    pieces.filter((piece) => piece.subject.startsWith('lobby/'));

  it('puts props on the floor line of the main lobby, clear of the door zones', () => {
    const lobby = row(span(8, 47, 'l'));
    const rows = { 1: lobby, 2: lobby, 3: lobby };
    const props = lobbyProps(planStructureRow(1, source(rows, 3)));
    expect(props.length).toBeGreaterThan(0);
    for (const piece of props) {
      expect(piece.y).toBe(29);
      expect(piece.anchorBottom).toBe(true);
      expect(piece.width).toBeUndefined();
      expect(piece.x).toBeGreaterThanOrEqual((8 + 3) * 8);
      expect(piece.x).toBeLessThan((48 - 3) * 8);
    }
  });

  it('draws no props above the bottom row of a tall lobby or on floors', () => {
    const lobby = row(span(8, 47, 'l'));
    const rows = { 1: lobby, 2: lobby, 3: lobby, 4: row(span(8, 47, 'f')) };
    expect(planStructureRow(2, source(rows, 3))).toEqual([]);
    expect(lobbyProps(planStructureRow(4, source(rows, 3)))).toEqual([]);
    expect(lobbyProps(planStructureRow(1, source({ 1: row(span(8, 47, 'f')) })))).toEqual([]);
  });

  it('puts props in one-floor lobbies of other levels and only plants and benches in sky lobbies', () => {
    const wide = row(span(4, 67, 'l'));
    const other = lobbyProps(planStructureRow(6, source({ 6: wide })));
    expect(other.length).toBeGreaterThan(0);
    const sky = lobbyProps(planStructureRow(15, source({ 15: wide })));
    expect(sky.length).toBeGreaterThan(0);
    for (const piece of sky) {
      expect(piece.subject).toMatch(/^lobby\/(plant-small|plant-tall|bench)$/);
    }
  });

  it('draws soil under a basement run with retaining walls', () => {
    const pieces = planStructureRow(-2, source({ '-2': row(span(0, 3, 'f')) }));
    expect(pieces[0]).toEqual({ subject: 'soil-2', x: 0, y: 0, width: 3000 });
    expect(pieces).toContainEqual({ subject: 'basement', x: 0, y: 0, width: 32 });
    expect(subjects(pieces)).toEqual([
      'soil-2',
      'basement',
      'basement-edge-left',
      'basement-edge-right',
    ]);
  });

  it('draws the subway tunnel across the whole site on S10', () => {
    const pieces = planStructureRow(-10, source({}));
    expect(pieces[0]).toEqual({ subject: 'subway-tunnel', x: 0, y: 0, width: 3000 });
    expect(subjects(pieces)).toContain('subway-tunnel-edge-left');
    expect(pieces.at(-1)).toEqual({ subject: 'subway-tunnel-edge-right', x: 2992, y: 0 });
  });
});

describe('levelsAffectedBy', () => {
  it('includes the level below for its roof', () => {
    expect(levelsAffectedBy(10)).toEqual([10, 9]);
  });

  it('never names level 0 or a basement for the roof', () => {
    expect(levelsAffectedBy(-3)).toEqual([-3]);
    expect(levelsAffectedBy(1)).toEqual([1, 2, 3]);
  });

  it('includes level 1 for the rows a tall main lobby reaches', () => {
    expect(levelsAffectedBy(3)).toEqual([3, 2, 1]);
    expect(levelsAffectedBy(4)).toEqual([4, 3, 1]);
  });
});
