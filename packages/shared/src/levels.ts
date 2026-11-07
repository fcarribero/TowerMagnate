import { TOWER_LAYOUT, UNIT_CATALOG } from './balance';
import type { Level } from './engine';

function cathedralFloors(): number {
  const height = UNIT_CATALOG.cathedral.height;
  if (height.kind !== 'fixed') {
    throw new Error('The cathedral must have a fixed height');
  }
  return height.floors;
}

export const LOWEST_LEVEL: Level = -TOWER_LAYOUT.subwayTunnelBasement;
export const LOWEST_BUILDABLE_LEVEL: Level = -TOWER_LAYOUT.usableBasements;
export const TOP_FLOOR_LEVEL: Level = TOWER_LAYOUT.floorsAboveGround;
export const CATHEDRAL_BOTTOM_LEVEL: Level = TOP_FLOOR_LEVEL + 1;
export const HIGHEST_LEVEL: Level = TOP_FLOOR_LEVEL + cathedralFloors();
export const LEVEL_COUNT = HIGHEST_LEVEL - LOWEST_LEVEL;

export const FIRST_COLUMN = 0;
export const LAST_COLUMN = TOWER_LAYOUT.siteWidthCells - 1;

/** True for every level that exists in the grid, including the subway tunnel. */
export function isLevel(level: number): level is Level {
  return Number.isInteger(level) && level !== 0 && level >= LOWEST_LEVEL && level <= HIGHEST_LEVEL;
}

export function isColumn(x: number): boolean {
  return Number.isInteger(x) && x >= FIRST_COLUMN && x <= LAST_COLUMN;
}

export function isBasement(level: Level): boolean {
  return level < 0;
}

/** Dense index for arrays and interpolation: 0 for the lowest level, no gap at ground. */
export function levelIndex(level: Level): number {
  if (!isLevel(level)) {
    throw new RangeError(`Level ${level} is outside the grid`);
  }
  return level < 0 ? level - LOWEST_LEVEL : level - LOWEST_LEVEL - 1;
}

export function levelOfIndex(index: number): Level {
  if (!Number.isInteger(index) || index < 0 || index >= LEVEL_COUNT) {
    throw new RangeError(`Level index ${index} is outside the grid`);
  }
  const level = index + LOWEST_LEVEL;
  return level < 0 ? level : level + 1;
}

/** The next level up, or null above the top of the grid. Level -1 is followed by level 1. */
export function levelAbove(level: Level): Level | null {
  const index = levelIndex(level) + 1;
  return index < LEVEL_COUNT ? levelOfIndex(index) : null;
}

/** The next level down, or null below the subway tunnel. Level 1 is followed by level -1. */
export function levelBelow(level: Level): Level | null {
  const index = levelIndex(level) - 1;
  return index >= 0 ? levelOfIndex(index) : null;
}

/** "S1" to "S10" for basements, the plain number otherwise. */
export function levelLabel(level: Level): string {
  return isBasement(level) ? `S${-level}` : String(level);
}
