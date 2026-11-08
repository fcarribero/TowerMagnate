import { describe, expect, it } from 'vitest';
import {
  cameraViewport,
  centerCameraOnRect,
  createCamera,
  nextZoom,
  panCamera,
  resizeCamera,
  screenRectOf,
  visibleLevels,
  zoomCamera,
  type Camera,
  type WorldRect,
} from './camera';
import { LEVEL_COUNT, WORLD_HEIGHT, WORLD_WIDTH, levelToIndex } from './levels';
import { ZOOM_LEVELS } from './metrics';

function expectWholePixels(camera: Camera): void {
  expect(Number.isInteger(camera.left)).toBe(true);
  expect(Number.isInteger(camera.top)).toBe(true);
}

describe('createCamera', () => {
  it('starts centered on the tower with ground level and two basements in view', () => {
    const camera = createCamera(1000, 600, 2);
    expect(camera.left).toBe((WORLD_WIDTH * 2 - 1000) / 2);
    expect(visibleLevels(camera).lowest).toBe(levelToIndex(-2));
    expectWholePixels(camera);
  });
});

describe('panCamera', () => {
  it('moves the content with the drag', () => {
    const camera = createCamera(1000, 600, 1);
    const moved = panCamera(camera, 40, -30);
    expect(moved.left).toBe(camera.left - 40);
    expect(moved.top).toBe(camera.top + 30);
  });

  it('rounds to whole device pixels', () => {
    const moved = panCamera(createCamera(1000, 600, 3), 10.4, -7.6);
    expectWholePixels(moved);
  });

  it('stops at the edges of the world', () => {
    const camera = createCamera(1000, 600, 2);
    const topLeft = panCamera(camera, 1e6, 1e6);
    expect(topLeft).toMatchObject({ left: 0, top: 0 });
    const bottomRight = panCamera(camera, -1e6, -1e6);
    expect(bottomRight.left).toBe(WORLD_WIDTH * 2 - 1000);
    expect(bottomRight.top).toBe(WORLD_HEIGHT * 2 - 600);
  });

  it('centers the world on an axis where it is smaller than the canvas', () => {
    const camera = createCamera(3200, 600, 1);
    expect(camera.left).toBe(-100);
    expect(panCamera(camera, 500, 0).left).toBe(-100);
  });
});

describe('zoomCamera', () => {
  it('keeps the world point under the anchor in place', () => {
    const camera = { ...createCamera(1000, 600, 1), left: 1000, top: 1500 };
    const zoomed = zoomCamera(camera, 2, 200, 100);
    expect((zoomed.left + 200) / 2).toBe((camera.left + 200) / 1);
    expect((zoomed.top + 100) / 2).toBe((camera.top + 100) / 1);
  });

  it('stays on whole pixels and inside the world at every zoom', () => {
    let camera = createCamera(1001, 751, 1);
    for (const zoom of ZOOM_LEVELS) {
      camera = zoomCamera(camera, zoom, 333, 77);
      expectWholePixels(camera);
      expect(camera.left).toBeGreaterThanOrEqual(0);
      expect(camera.top + camera.viewHeight).toBeLessThanOrEqual(WORLD_HEIGHT * zoom);
    }
  });
});

describe('nextZoom', () => {
  it('steps through whole zoom levels and stops at 1x and 4x', () => {
    expect(nextZoom(1, 1)).toBe(2);
    expect(nextZoom(3, -1)).toBe(2);
    expect(nextZoom(4, 1)).toBe(4);
    expect(nextZoom(1, -1)).toBe(1);
  });
});

describe('resizeCamera', () => {
  it('keeps the centre of the view in place', () => {
    const camera = { ...createCamera(1000, 600, 2), left: 2000, top: 3000 };
    const resized = resizeCamera(camera, 800, 400);
    expect(resized.left + 400).toBe(camera.left + 500);
    expect(resized.top + 200).toBe(camera.top + 300);
  });
});

describe('visibleLevels', () => {
  it('includes levels that are only partly on screen', () => {
    const camera: Camera = { zoom: 1, left: 0, top: 16, viewWidth: 100, viewHeight: 64 };
    expect(visibleLevels(camera)).toEqual({
      highest: LEVEL_COUNT - 1,
      lowest: LEVEL_COUNT - 3,
    });
  });

  it('keeps the number of drawn levels flat while scrolling the whole tower', () => {
    for (const zoom of ZOOM_LEVELS) {
      let camera = panCamera(createCamera(1280, 720, zoom), 0, 1e6);
      const counts = new Set<number>();
      while (true) {
        const range = visibleLevels(camera);
        counts.add(range.highest - range.lowest + 1);
        const next = panCamera(camera, 0, -7);
        if (next.top === camera.top) {
          break;
        }
        camera = next;
      }
      const mostLevelsThatFit = Math.ceil(720 / (32 * zoom)) + 1;
      expect(Math.max(...counts)).toBeLessThanOrEqual(mostLevelsThatFit);
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(mostLevelsThatFit - 1);
    }
  });
});

describe('cameraViewport', () => {
  it('reports levels and columns with the margin, skipping level 0', () => {
    const rowsFromBottom = 12;
    const camera: Camera = {
      zoom: 2,
      left: 160,
      top: (WORLD_HEIGHT - rowsFromBottom * 32) * 2,
      viewWidth: 320,
      viewHeight: 128,
    };
    expect(visibleLevels(camera)).toEqual({ lowest: levelToIndex(1), highest: levelToIndex(2) });
    expect(cameraViewport(camera, 1)).toEqual({ levelFrom: -1, levelTo: 3, xFrom: 10, xTo: 29 });
  });
});

describe('centerCameraOnRect', () => {
  const unit: WorldRect = { x: 1400, y: 2000, width: 64, height: 36 };

  it.each(ZOOM_LEVELS)('puts the rectangle centre at the canvas centre at zoom %i', (zoom) => {
    const camera = centerCameraOnRect(createCamera(1000, 600, zoom), unit);
    const screen = screenRectOf(camera, unit);
    expect(screen).not.toBeNull();
    expect(Math.abs((screen?.x ?? 0) + (screen?.width ?? 0) / 2 - 500)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((screen?.y ?? 0) + (screen?.height ?? 0) / 2 - 300)).toBeLessThanOrEqual(0.5);
    expectWholePixels(camera);
  });

  it('stops at the tower edges', () => {
    const corner: WorldRect = { x: 0, y: 0, width: 16, height: 36 };
    const camera = centerCameraOnRect(createCamera(1000, 600, 2), corner);
    expect(camera).toMatchObject({ left: 0, top: 0 });
    const screen = screenRectOf(camera, corner);
    expect(screen).toEqual({ x: 0, y: 0, width: 32, height: 72 });
  });
});

describe('screenRectOf', () => {
  const camera = { ...createCamera(1000, 600, 3), left: 300, top: 900 };

  it.each(ZOOM_LEVELS)('scales and offsets the rectangle at zoom %i', (zoom) => {
    const zoomed = { ...camera, zoom, left: 10, top: 10 };
    const screen = screenRectOf(zoomed, { x: 20, y: 20, width: 64, height: 36 });
    expect(screen).toEqual({
      x: 20 * zoom - 10,
      y: 20 * zoom - 10,
      width: 64 * zoom,
      height: 36 * zoom,
    });
  });

  it('is null when the rectangle is fully outside the view', () => {
    expect(screenRectOf(camera, { x: 0, y: 0, width: 64, height: 36 })).toBeNull();
    expect(screenRectOf(camera, { x: 5000, y: 1000, width: 64, height: 36 })).toBeNull();
    expect(screenRectOf(camera, { x: 200, y: 5000, width: 64, height: 36 })).toBeNull();
  });

  it('keeps a rectangle that is partly in view', () => {
    const partly = screenRectOf(camera, { x: 90, y: 300, width: 64, height: 36 });
    expect(partly).toMatchObject({ x: -30, width: 192 });
  });
});
