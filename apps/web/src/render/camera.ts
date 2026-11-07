import {
  LEVEL_COUNT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  indexAtWorldY,
  indexToLevel,
  levelToIndex,
  levelTop,
} from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH, ZOOM_LEVELS, type Zoom } from './metrics';

/**
 * The part of the zoomed world shown on the canvas. `left` and `top` are the
 * whole device pixels between the zoomed world's top-left corner and the
 * canvas's top-left corner; they are negative when the world is smaller than
 * the canvas and is centered in it.
 */
export interface Camera {
  zoom: Zoom;
  left: number;
  top: number;
  viewWidth: number;
  viewHeight: number;
}

export interface LevelRange {
  lowest: number;
  highest: number;
}

export interface ViewportRequest {
  levelFrom: number;
  levelTo: number;
  xFrom: number;
  xTo: number;
}

const BASEMENT_FLOORS_SHOWN_AT_START = 2;

export function createCamera(viewWidth: number, viewHeight: number, zoom: Zoom): Camera {
  const groundY = levelTop(levelToIndex(1)) + FLOOR_HEIGHT;
  const viewBottomY = groundY + BASEMENT_FLOORS_SHOWN_AT_START * FLOOR_HEIGHT;
  return clampCamera({
    zoom,
    left: (WORLD_WIDTH * zoom - viewWidth) / 2,
    top: viewBottomY * zoom - viewHeight,
    viewWidth,
    viewHeight,
  });
}

export function panCamera(camera: Camera, contentDx: number, contentDy: number): Camera {
  return clampCamera({
    ...camera,
    left: camera.left - contentDx,
    top: camera.top - contentDy,
  });
}

/** Changes zoom while keeping the world point under the anchor (canvas pixels) in place. */
export function zoomCamera(camera: Camera, zoom: Zoom, anchorX: number, anchorY: number): Camera {
  const worldX = (camera.left + anchorX) / camera.zoom;
  const worldY = (camera.top + anchorY) / camera.zoom;
  return clampCamera({
    ...camera,
    zoom,
    left: worldX * zoom - anchorX,
    top: worldY * zoom - anchorY,
  });
}

/** Changes the canvas size while keeping the world point at the canvas centre in place. */
export function resizeCamera(camera: Camera, viewWidth: number, viewHeight: number): Camera {
  return clampCamera({
    ...camera,
    left: camera.left + (camera.viewWidth - viewWidth) / 2,
    top: camera.top + (camera.viewHeight - viewHeight) / 2,
    viewWidth,
    viewHeight,
  });
}

export function nextZoom(zoom: Zoom, direction: 1 | -1): Zoom {
  const position = ZOOM_LEVELS.indexOf(zoom) + direction;
  const clamped = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, position));
  return ZOOM_LEVELS[clamped] ?? zoom;
}

export function clampCamera(camera: Camera): Camera {
  return {
    ...camera,
    left: clampAxis(camera.left, WORLD_WIDTH * camera.zoom, camera.viewWidth),
    top: clampAxis(camera.top, WORLD_HEIGHT * camera.zoom, camera.viewHeight),
  };
}

function clampAxis(offset: number, worldSize: number, viewSize: number): number {
  if (worldSize <= viewSize) {
    return -Math.floor((viewSize - worldSize) / 2);
  }
  const wholeOffset = Math.round(offset);
  return Math.min(worldSize - viewSize, Math.max(0, wholeOffset));
}

/** Levels with at least one pixel on the canvas, as dense indices. */
export function visibleLevels(camera: Camera): LevelRange {
  const topWorldY = Math.max(0, camera.top / camera.zoom);
  const bottomWorldY = Math.min(
    WORLD_HEIGHT - 1,
    (camera.top + camera.viewHeight - 1) / camera.zoom,
  );
  return {
    lowest: Math.max(0, indexAtWorldY(bottomWorldY)),
    highest: Math.min(LEVEL_COUNT - 1, indexAtWorldY(topWorldY)),
  };
}

/** The `viewport` message for the server: visible levels and columns, widened by a margin. */
export function cameraViewport(camera: Camera, marginLevels: number): ViewportRequest {
  const levels = visibleLevels(camera);
  const lowest = Math.max(0, levels.lowest - marginLevels);
  const highest = Math.min(LEVEL_COUNT - 1, levels.highest + marginLevels);
  const tileOnScreen = TILE_WIDTH * camera.zoom;
  const lastColumn = WORLD_WIDTH / TILE_WIDTH - 1;
  return {
    levelFrom: indexToLevel(lowest),
    levelTo: indexToLevel(highest),
    xFrom: Math.max(0, Math.floor(camera.left / tileOnScreen)),
    xTo: Math.min(lastColumn, Math.floor((camera.left + camera.viewWidth - 1) / tileOnScreen)),
  };
}
