import { TOWER_LAYOUT, UNIT_CATALOG } from './balance';

/** A floor number: -10..-1 for basements, 1..104 above ground. There is no level 0. */
export type Level = number;

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
export function isLevel(value: unknown): value is Level {
  return (
    Number.isInteger(value) &&
    (value as number) !== 0 &&
    (value as number) >= LOWEST_LEVEL &&
    (value as number) <= HIGHEST_LEVEL
  );
}

export function isColumn(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= FIRST_COLUMN && (x as number) <= LAST_COLUMN;
}

export function isBasement(level: Level): boolean {
  return level < 0;
}

/** Dense index for arrays and interpolation: 0 for the lowest level, no gap at ground. */
export function levelToIndex(level: Level): number {
  if (!isLevel(level)) {
    throw new RangeError(`Level ${level} is outside the grid`);
  }
  return level < 0 ? level - LOWEST_LEVEL : level - LOWEST_LEVEL - 1;
}

export function indexToLevel(index: number): Level {
  if (!Number.isInteger(index) || index < 0 || index >= LEVEL_COUNT) {
    throw new RangeError(`Level index ${index} is outside the grid`);
  }
  const level = index + LOWEST_LEVEL;
  return level < 0 ? level : level + 1;
}

/** The next level up, or null above the top of the grid. Level -1 is followed by level 1. */
export function levelAbove(level: Level): Level | null {
  const index = levelToIndex(level) + 1;
  return index < LEVEL_COUNT ? indexToLevel(index) : null;
}

/** The next level down, or null below the subway tunnel. Level 1 is followed by level -1. */
export function levelBelow(level: Level): Level | null {
  const index = levelToIndex(level) - 1;
  return index >= 0 ? indexToLevel(index) : null;
}

/** "S1" to "S10" for basements, the plain number otherwise. */
export function levelLabel(level: Level): string {
  return isBasement(level) ? `S${-level}` : String(level);
}
