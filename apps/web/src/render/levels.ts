import { FLOOR_HEIGHT, TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

export const LOWEST_LEVEL = -10;
export const HIGHEST_LEVEL = 104;
export const LEVEL_COUNT = HIGHEST_LEVEL - LOWEST_LEVEL;

export const WORLD_WIDTH = TOWER_WIDTH_TILES * TILE_WIDTH;
export const WORLD_HEIGHT = LEVEL_COUNT * FLOOR_HEIGHT;

/** Dense index without the missing level 0: 0 for level -10, 113 for level 104. */
export function levelToIndex(level: number): number {
  return level < 0 ? level - LOWEST_LEVEL : level - LOWEST_LEVEL - 1;
}

export function indexToLevel(index: number): number {
  const level = index + LOWEST_LEVEL;
  return level < 0 ? level : level + 1;
}

/** World y, in zoom 1 pixels from the top of the world, of the top edge of a level. */
export function levelTop(index: number): number {
  return (LEVEL_COUNT - 1 - index) * FLOOR_HEIGHT;
}

/** Dense index of the level whose row contains the given world y. */
export function indexAtWorldY(worldY: number): number {
  const rowFromTop = Math.floor(worldY / FLOOR_HEIGHT);
  return LEVEL_COUNT - 1 - rowFromTop;
}
