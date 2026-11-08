import type { Page } from '@playwright/test';

const ZOOM = 2;
const TILE_PIXELS = 8 * ZOOM;
const FLOOR_PIXELS = 32 * ZOOM;
const WORLD_WIDTH_TILES = 375;
const LEVEL_COUNT = 114;
const LOWEST_LEVEL = -10;
const GROUND_ROW_FROM_TOP = LEVEL_COUNT - 1 - 10;
const BASEMENT_ROWS_SHOWN = 2;

export const CENTER_COLUMN = Math.floor(WORLD_WIDTH_TILES / 2);

function levelIndex(level: number): number {
  return level < 0 ? level - LOWEST_LEVEL : level - LOWEST_LEVEL - 1;
}

/** Canvas pixel inside a tile of the starting camera: zoom 2, level 1 on the ground row above two basements. */
export function tilePoint(
  canvas: { width: number; height: number },
  column: number,
  level: number,
): { x: number; y: number } {
  const left = Math.round((WORLD_WIDTH_TILES * TILE_PIXELS - canvas.width) / 2);
  const viewBottom = (GROUND_ROW_FROM_TOP + 1 + BASEMENT_ROWS_SHOWN) * FLOOR_PIXELS;
  const top = viewBottom - canvas.height;
  const rowFromTop = LEVEL_COUNT - 1 - levelIndex(level);
  return {
    x: (column + 0.5) * TILE_PIXELS - left,
    y: (rowFromTop + 0.5) * FLOOR_PIXELS - top,
  };
}

export async function canvasBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) {
    throw new Error('The game canvas has no box');
  }
  return box;
}
