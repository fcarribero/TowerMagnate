import { levelLabel, type Level } from '@tower-magnate/shared';
import { visibleLevels, type Camera } from './camera';
import { LEVEL_COUNT, indexAtWorldY, indexToLevel, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';

export interface RulerMark {
  level: Level;
  label: string;
  /** Top edge of the level on the canvas, in device pixels. */
  top: number;
  /** Height of the level on the canvas, in device pixels. */
  height: number;
}

/** One mark per level with at least one pixel on the canvas, highest first. */
export function rulerMarks(camera: Camera): RulerMark[] {
  const range = visibleLevels(camera);
  const marks: RulerMark[] = [];
  for (let index = range.highest; index >= range.lowest; index -= 1) {
    const level = indexToLevel(index);
    marks.push({
      level,
      label: levelLabel(level),
      top: levelTop(index) * camera.zoom - camera.top,
      height: FLOOR_HEIGHT * camera.zoom,
    });
  }
  return marks;
}

/** The level under a canvas point given in device pixels, or null outside the world. */
export function levelAtCanvasY(camera: Camera, canvasY: number): Level | null {
  const worldY = (camera.top + canvasY) / camera.zoom;
  const index = indexAtWorldY(worldY);
  if (worldY < 0 || index < 0 || index >= LEVEL_COUNT) {
    return null;
  }
  return indexToLevel(index);
}
