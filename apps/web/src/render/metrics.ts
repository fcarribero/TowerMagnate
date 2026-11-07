export const TILE_WIDTH = 8;
export const FLOOR_HEIGHT = 32;
export const SLAB_HEIGHT = 3;
export const TOWER_WIDTH_TILES = 375;
export const ZOOM_LEVELS = [1, 2, 3, 4] as const;

export type Zoom = (typeof ZOOM_LEVELS)[number];
