import type { Level } from '@tower-magnate/shared';
import type { Camera } from './camera';
import { levelAtCanvasY } from './levelRuler';
import { TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

export interface Cell {
  x: number;
  level: Level;
}

/** The tile under a canvas point given in device pixels, or null outside the world. */
export function cellAtCanvasPoint(camera: Camera, canvasX: number, canvasY: number): Cell | null {
  const level = levelAtCanvasY(camera, canvasY);
  const column = Math.floor((camera.left + canvasX) / (camera.zoom * TILE_WIDTH));
  if (level === null || column < 0 || column >= TOWER_WIDTH_TILES) {
    return null;
  }
  return { x: column, level };
}
