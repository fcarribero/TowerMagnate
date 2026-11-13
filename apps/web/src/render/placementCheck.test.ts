import { describe, expect, it } from 'vitest';
import { checkPlacement, isGhostTool, thingAt, type PlacementWorld } from './placementCheck';

const SITE = 375;

function row(built: Record<number, string>): string {
  const cells = Array.from({ length: SITE }, () => '.');
  for (const [from, text] of Object.entries(built)) {
    [...text].forEach((cell, offset) => {
      cells[Number(from) + offset] = cell;
    });
  }
  return cells.join('');
}

function world(overrides: Partial<PlacementWorld> = {}): PlacementWorld {
  return {
    structure: new Map([[2, row({ 10: 'f'.repeat(30) })]]),
    units: [],
    transports: [],
    ...overrides,
  };
}

describe('checkPlacement', () => {
  it('accepts a footprint resting on a floor', () => {
    expect(checkPlacement('office', 10, 3, world()).problem).toBeNull();
  });

  it('rejects a footprint with no structure under part of it', () => {
    expect(checkPlacement('office', 35, 3, world()).problem).toBe('NO_SUPPORT');
  });

  it('accepts a footprint resting on another unit', () => {
    const below = { type: 'office', x: 10, level: 2 } as const;
    const bare = world({ structure: new Map() });
    expect(checkPlacement('office', 10, 3, { ...bare, units: [below] }).problem).toBeNull();
  });

  it('rejects overlap with a unit, including a tall one on its upper level', () => {
    const cinema = { type: 'cinema', x: 12, level: 2 } as const;
    const withCinema = world({
      units: [cinema],
      structure: new Map([
        [2, row({ 10: 'f'.repeat(30) })],
        [3, row({ 10: 'f'.repeat(30) })],
      ]),
    });
    expect(checkPlacement('office', 14, 3, withCinema).problem).toBe('CELL_OCCUPIED');
  });

  it('lets stairs pass over a unit but not over other stairs', () => {
    const office = { type: 'office', x: 12, level: 3 } as const;
    expect(checkPlacement('stairs', 10, 3, world({ units: [office] })).problem).toBeNull();
    const stairs = { type: 'stairs', x: 10, level: 3 } as const;
    expect(checkPlacement('escalator', 12, 3, world({ transports: [stairs] })).problem).toBe(
      'CELL_OCCUPIED',
    );
  });

  it('lets a unit go behind stairs', () => {
    const stairs = { type: 'stairs', x: 10, level: 3 } as const;
    expect(checkPlacement('office', 12, 3, world({ transports: [stairs] })).problem).toBeNull();
  });

  it('rejects building over lobby cells', () => {
    const lobby = new Map([
      [1, row({ 10: 'l'.repeat(30) })],
      [2, row({ 10: 'f'.repeat(30) })],
    ]);
    expect(checkPlacement('office', 10, 1, world({ structure: lobby })).problem).toBe(
      'CELL_OCCUPIED',
    );
  });

  it('lets level 1 rest on the ground', () => {
    const empty = world({ structure: new Map() });
    expect(checkPlacement('office', 10, 1, empty).problem).toBeNull();
  });

  it('hangs a basement unit from the row above', () => {
    const above = new Map([[-1, row({ 10: 'f'.repeat(30) })]]);
    expect(checkPlacement('office', 10, -2, world({ structure: above })).problem).toBeNull();
    expect(checkPlacement('office', 10, -3, world({ structure: above })).problem).toBe(
      'NO_SUPPORT',
    );
  });

  it('rejects a footprint outside the site', () => {
    expect(checkPlacement('office', SITE - 2, 3, world()).problem).toBe('OUT_OF_BOUNDS');
    expect(checkPlacement('office', -1, 3, world()).problem).toBe('OUT_OF_BOUNDS');
  });

  it('rejects a footprint that runs past the top level', () => {
    expect(checkPlacement('cinema', 10, 104, world()).problem).toBe('OUT_OF_BOUNDS');
  });
});

describe('isGhostTool', () => {
  it('covers units and stairs but not structure or shafts', () => {
    expect(isGhostTool('office')).toBe(true);
    expect(isGhostTool('escalator')).toBe(true);
    expect(isGhostTool('floor')).toBe(false);
    expect(isGhostTool('standard-elevator')).toBe(false);
  });
});

describe('thingAt', () => {
  it('finds a unit from any covered cell', () => {
    const cinema = { type: 'cinema', x: 12, level: 2 } as const;
    const w = world({ units: [cinema] });
    expect(thingAt(w, 12, 3)).toBe(cinema);
    expect(thingAt(w, 11, 2)).toBeNull();
    expect(thingAt(w, 12, 4)).toBeNull();
  });
});
