import { levelToIndex, type Level } from '@tower-magnate/shared';
import { levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';

/** The world point at the middle of a person standing at column `x` on `level`. */
export function personWorldPoint(person: { x: number; level: Level }): { x: number; y: number } {
  return {
    x: (person.x + 0.5) * TILE_WIDTH,
    y: levelTop(levelToIndex(person.level)) + FLOOR_HEIGHT / 2,
  };
}
