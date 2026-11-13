import { describe, expect, it } from 'vitest';
import { planPreview } from './placementPreview';
import type { PlacementWorld } from './placementCheck';
import { cellAtCanvasPoint } from './cellAtPoint';
import { levelToIndex, levelTop } from './levels';
import type { Camera } from './camera';

const floorRow = '.'.repeat(10) + 'f'.repeat(30) + '.'.repeat(335);
const world: PlacementWorld = {
  structure: new Map([[2, floorRow]]),
  units: [{ type: 'office', x: 10, level: 3 }],
  transports: [],
};

describe('planPreview', () => {
  it('draws a valid ghost on a free supported cell', () => {
    const { ghost } = planPreview(
      { kind: 'build', type: 'office' },
      { x: 20, level: 3 },
      world,
      'day',
    );
    expect(ghost).toMatchObject({ x: 20, level: 3, valid: true, floors: 1 });
  });

  it('frames stairs over two levels while they still occupy one', () => {
    const { ghost } = planPreview(
      { kind: 'build', type: 'stairs' },
      { x: 20, level: 3 },
      world,
      'day',
    );
    expect(ghost).toMatchObject({ floors: 1, frameFloors: 2 });
  });

  it('marks the ghost invalid when the cash cannot pay for it', () => {
    const tool = { kind: 'build', type: 'office' } as const;
    const cell = { x: 20, level: 3 };
    expect(planPreview(tool, cell, { ...world, money: 0 }, 'day').ghost?.valid).toBe(false);
    expect(planPreview(tool, cell, { ...world, money: 10_000_000 }, 'day').ghost?.valid).toBe(true);
  });

  it('reads one-shot iterators of the world once and still checks stairs spacing', () => {
    const rows = new Map([
      [3, '.'.repeat(10) + 'f'.repeat(40) + '.'.repeat(325)],
      [4, '.'.repeat(10) + 'f'.repeat(40) + '.'.repeat(325)],
    ]);
    const stairs = [{ type: 'stairs', x: 10, level: 3 }] as const;
    const iterating: PlacementWorld = {
      structure: rows,
      units: [][Symbol.iterator](),
      transports: stairs[Symbol.iterator](),
    };
    const tool = { kind: 'build', type: 'stairs' } as const;
    expect(planPreview(tool, { x: 20, level: 3 }, iterating, 'day').ghost?.valid).toBe(false);
  });

  it('marks the ghost invalid over a unit and over a missing floor', () => {
    const tool = { kind: 'build', type: 'office' } as const;
    expect(planPreview(tool, { x: 12, level: 3 }, world, 'day').ghost?.valid).toBe(false);
    expect(planPreview(tool, { x: 20, level: 4 }, world, 'day').ghost?.valid).toBe(false);
  });

  it('draws no ghost for drag tools or without a pointer', () => {
    expect(
      planPreview({ kind: 'build', type: 'floor' }, { x: 1, level: 2 }, world, 'day').ghost,
    ).toBeNull();
    expect(planPreview({ kind: 'build', type: 'office' }, null, world, 'day').ghost).toBeNull();
  });

  it('frames the hovered unit when inspecting', () => {
    const { highlight, ghost } = planPreview(
      { kind: 'inspect' },
      { x: 14, level: 3 },
      world,
      'day',
    );
    expect(ghost).toBeNull();
    expect(highlight).toEqual({ x: 10, level: 3, width: 9, floors: 1 });
    expect(
      planPreview({ kind: 'inspect' }, { x: 25, level: 3 }, world, 'day').highlight,
    ).toBeNull();
  });

  it('shows nothing for tools that do not preview', () => {
    expect(planPreview({ kind: 'none' }, { x: 14, level: 3 }, world, 'day')).toEqual({
      ghost: null,
      highlight: null,
    });
  });
});

describe('cellAtCanvasPoint', () => {
  it.each([1, 2, 3, 4] as const)('snaps to the tile at zoom %i', (zoom) => {
    const camera: Camera = {
      zoom,
      left: 40 * 8 * zoom,
      top: levelTop(levelToIndex(5)) * zoom,
      viewWidth: 800,
      viewHeight: 320,
    };
    const tile = 8 * zoom;
    expect(cellAtCanvasPoint(camera, tile * 3 + tile - 1, 1)).toEqual({ x: 43, level: 5 });
    expect(cellAtCanvasPoint(camera, tile * 4, 1)).toEqual({ x: 44, level: 5 });
  });

  it('is null left of the site', () => {
    const camera: Camera = { zoom: 1, left: -50, top: 0, viewWidth: 800, viewHeight: 320 };
    expect(cellAtCanvasPoint(camera, 10, 10)).toBeNull();
  });
});
