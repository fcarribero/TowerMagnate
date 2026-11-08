import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';

/** The world point (zoom 1 pixels) at the middle of the person's floor row, for centering the view. */
export function personWorldPoint(x: number, level: number): { x: number; y: number } {
  return { x: x * TILE_WIDTH, y: levelTop(levelToIndex(level)) + FLOOR_HEIGHT / 2 };
}
