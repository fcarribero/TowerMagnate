import { describe, expect, it } from 'vitest';
import { TowerContentStore, type ContentSnapshot } from '../model/towerContent';
import { centerCamera, createCamera, visibleLevels } from './camera';
import { LEVEL_COUNT, levelToIndex } from './levels';
import {
  MAP_COLORS,
  MAP_HEIGHT,
  MAP_ROW_HEIGHT,
  MAP_WIDTH,
  mapFrame,
  mapPointToWorld,
  mapRowTop,
  paintTowerMap,
  unitMapColor,
} from './towerMap';

function colorAt(pixels: Uint8ClampedArray, x: number, y: number): number {
  const offset = (y * MAP_WIDTH + x) * 4;
  return (
    ((pixels[offset] ?? 0) << 16) | ((pixels[offset + 1] ?? 0) << 8) | (pixels[offset + 2] ?? 0)
  );
}

function rowOf(level: number): number {
  return mapRowTop(levelToIndex(level));
}

const emptySite: ContentSnapshot = { levels: {}, units: [] };

describe('map size', () => {
  it('is one pixel per column and two per level', () => {
    expect(MAP_WIDTH).toBe(375);
    expect(MAP_HEIGHT).toBe(228);
    expect(MAP_HEIGHT).toBe(LEVEL_COUNT * MAP_ROW_HEIGHT);
  });
});

describe('paintTowerMap', () => {
  it('draws sky above ground and soil below on an empty site', () => {
    const store = new TowerContentStore();
    store.applySnapshot(emptySite);
    const pixels = paintTowerMap(store.content);
    expect(colorAt(pixels, 0, 0)).toBe(MAP_COLORS.sky);
    expect(colorAt(pixels, 100, rowOf(1) + 1)).toBe(MAP_COLORS.sky);
    expect(colorAt(pixels, 100, rowOf(-1))).toBe(MAP_COLORS.soil);
    expect(colorAt(pixels, 374, MAP_HEIGHT - 1)).toBe(MAP_COLORS.soil);
  });

  it('draws bare floors and lobby cells from the structure rows', () => {
    const store = new TowerContentStore();
    store.applySnapshot({
      levels: { 1: { structure: '.ll' }, 2: { structure: '..ff' } },
      units: [],
    });
    const pixels = paintTowerMap(store.content);
    expect(colorAt(pixels, 0, rowOf(1))).toBe(MAP_COLORS.sky);
    expect(colorAt(pixels, 1, rowOf(1))).toBe(MAP_COLORS.lobby);
    expect(colorAt(pixels, 3, rowOf(2) + 1)).toBe(MAP_COLORS.floor);
    expect(colorAt(pixels, 4, rowOf(2))).toBe(MAP_COLORS.sky);
  });

  it('colors a unit across its catalog width and height', () => {
    const store = new TowerContentStore();
    store.applySnapshot({
      levels: {},
      units: [{ id: 'u1', type: 'cinema', x: 100, level: 5 }],
    });
    const pixels = paintTowerMap(store.content);
    expect(colorAt(pixels, 100, rowOf(5))).toBe(MAP_COLORS.commerce);
    expect(colorAt(pixels, 130, rowOf(6))).toBe(MAP_COLORS.commerce);
    expect(colorAt(pixels, 131, rowOf(5))).toBe(MAP_COLORS.sky);
    expect(colorAt(pixels, 100, rowOf(7))).toBe(MAP_COLORS.sky);
  });

  it('runs a shaft over the floors it serves and skips the missing level 0', () => {
    const store = new TowerContentStore();
    store.applySnapshot({
      levels: {},
      units: [{ id: 's1', type: 'standard-elevator', x: 50, level: -2, floors: 5 }],
    });
    const pixels = paintTowerMap(store.content);
    for (const level of [-2, -1, 1, 2, 3]) {
      expect(colorAt(pixels, 50, rowOf(level))).toBe(MAP_COLORS.transport);
    }
    expect(colorAt(pixels, 50, rowOf(4))).toBe(MAP_COLORS.sky);
  });

  it('shows a unit built on floor 80 after the delta arrives', () => {
    const store = new TowerContentStore();
    store.applySnapshot(emptySite);
    expect(colorAt(paintTowerMap(store.content), 200, rowOf(80))).toBe(MAP_COLORS.sky);
    store.applyDelta({
      structure: [{ level: 80, structure: '.'.repeat(200) + 'f'.repeat(9) }],
      unitsUpserted: [{ id: 'u7', type: 'office', x: 200, level: 80 }],
    });
    expect(colorAt(paintTowerMap(store.content), 200, rowOf(80))).toBe(
      MAP_COLORS.officesAndHousing,
    );
  });
});

describe('unitMapColor', () => {
  it('follows the UI spec groups', () => {
    expect(unitMapColor('condo')).toBe(MAP_COLORS.officesAndHousing);
    expect(unitMapColor('suite')).toBe(MAP_COLORS.hotel);
    expect(unitMapColor('restaurant')).toBe(MAP_COLORS.commerce);
    expect(unitMapColor('escalator')).toBe(MAP_COLORS.transport);
    expect(unitMapColor('express-elevator')).toBe(MAP_COLORS.transport);
    expect(unitMapColor('medical-center')).toBe(MAP_COLORS.services);
    expect(unitMapColor('cathedral')).toBe(MAP_COLORS.cathedral);
    expect(unitMapColor('subway-station')).toBe(MAP_COLORS.subway);
    expect(unitMapColor('lobby')).toBe(MAP_COLORS.lobby);
  });
});

describe('mapFrame', () => {
  it('marks the visible part of the view in map pixels', () => {
    const camera = { zoom: 1, left: 80, top: 320, viewWidth: 800, viewHeight: 640 } as const;
    expect(mapFrame(camera)).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it('scales with zoom and stays inside the map', () => {
    const camera = createCamera(7000, 400, 2);
    const frame = mapFrame(camera);
    expect(frame.x).toBe(0);
    expect(frame.width).toBe(MAP_WIDTH);
    expect(frame.y + frame.height).toBeLessThanOrEqual(MAP_HEIGHT);
    expect(frame.height).toBe(Math.ceil(400 / 2 / 16));
  });
});

describe('clicking the map', () => {
  it('centers the view on floor 80 when its row is clicked', () => {
    const camera = createCamera(1200, 700, 2);
    const { worldX, worldY } = mapPointToWorld(200, rowOf(80));
    const centered = centerCamera(camera, worldX, worldY);
    const levels = visibleLevels(centered);
    const floor80 = levelToIndex(80);
    expect(levels.lowest).toBeLessThan(floor80);
    expect(levels.highest).toBeGreaterThan(floor80);
    const middleColumn = (centered.left + centered.viewWidth / 2) / centered.zoom / 8;
    expect(Math.floor(middleColumn)).toBe(200);
  });

  it('keeps out-of-map points on the edge', () => {
    expect(mapPointToWorld(-5, 9999)).toEqual(mapPointToWorld(0, MAP_HEIGHT - 1));
  });
});
