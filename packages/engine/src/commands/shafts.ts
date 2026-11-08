import {
  CATHEDRAL_BOTTOM_LEVEL,
  isBasement,
  isColumn,
  isLevel,
  levelAbove,
  LOWEST_BUILDABLE_LEVEL,
  SHAFT_UNIT_TYPES,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type ElevatorCar,
  type ErrorCode,
  type GridState,
  type Level,
  type Shaft,
  type ShaftId,
  type ShaftType,
  type TowerState,
} from '@tower-magnate/shared';
import { cellsWithoutStructure, levelError, overlappingOccupants } from '../grid';

/** The cells a shaft would cover: columns x..x + width - 1 on levels bottom..top. */
export interface ShaftRange {
  x: number;
  bottom: Level;
  top: Level;
}

export interface ShaftPrices {
  shaft: number;
  car: number;
}

/** C-39: columns that must stay free of other shafts between two shafts sharing a level. */
export const MIN_SHAFT_GAP = 8;

const HIGHEST_SHAFT_LEVEL: Level = CATHEDRAL_BOTTOM_LEVEL;

function shaftDefinition(type: ShaftType) {
  return UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
}

export function shaftWidth(type: ShaftType): number {
  return shaftDefinition(type).width;
}

export function shaftPrices(type: ShaftType): ShaftPrices {
  const cost = shaftDefinition(type).cost;
  if (cost.kind !== 'shaft') {
    throw new Error(`${type} elevator is not priced as a shaft`);
  }
  return { shaft: cost.shaftAmount, car: cost.perCarAmount };
}

export function maxCarsPerShaft(type: ShaftType): number {
  return shaftDefinition(type).placement.maxCarsPerShaft ?? 1;
}

function maxSpan(type: ShaftType): number | null {
  const height = shaftDefinition(type).height;
  return height.kind === 'shaft' ? height.maxFloorsServed : null;
}

/** C-38: express cars stop only in basements, the main lobby and the sky lobbies. */
export function isExpressStop(level: Level): boolean {
  return (
    isBasement(level) ||
    level === TOWER_LAYOUT.mainLobbyFloor ||
    (TOWER_LAYOUT.skyLobbyFloors as readonly number[]).includes(level)
  );
}

export function isInsideShaft(shaft: ShaftRange, level: Level): boolean {
  return isLevel(level) && level >= shaft.bottom && level <= shaft.top;
}

/** Every level from bottom to top, skipping level 0. */
export function shaftLevels(range: ShaftRange): Level[] {
  const levels: Level[] = [];
  for (let level: Level | null = range.bottom; level !== null && level <= range.top;) {
    levels.push(level);
    level = levelAbove(level);
  }
  return levels;
}

export function idleCar(homeLevel: Level, paid: number, placedAtStep: number): ElevatorCar {
  return {
    homeLevel,
    level: homeLevel,
    riders: [],
    trips: [],
    phase: 'idle',
    direction: 'idle',
    phaseStepsLeft: 0,
    assigned: [],
    paid,
    placedAtStep,
  };
}

/** C-35: free, or already taken by the shaft being resized. */
function isFreeForShaft(
  grid: GridState,
  level: Level,
  x0: number,
  x1: number,
  self: ShaftId | null,
): boolean {
  return overlappingOccupants(grid, level, x0, x1).every(
    ({ occupant }) => occupant.kind === 'shaft' && occupant.id === self,
  );
}

function sharesLevel(range: ShaftRange, other: Shaft): boolean {
  return range.bottom <= other.top && other.bottom <= range.top;
}

function columnGap(range: ShaftRange, width: number, other: Shaft): number {
  if (range.x < other.x) return other.x - (range.x + width);
  return range.x - (other.x + shaftWidth(other.type));
}

function boundsError(range: ShaftRange, width: number): ErrorCode | null {
  const error = levelError(range.bottom) ?? levelError(range.top);
  if (error) return error;
  if (range.bottom < LOWEST_BUILDABLE_LEVEL || range.top > HIGHEST_SHAFT_LEVEL) {
    return 'OUT_OF_BOUNDS';
  }
  if (!isColumn(range.x) || !isColumn(range.x + width - 1)) return 'OUT_OF_BOUNDS';
  return null;
}

/**
 * C-34 to C-39 in check order for a shaft of this type over the range. `self` is the shaft being
 * resized, whose own cells and spacing do not count; null for a new shaft.
 */
export function shaftRangeError(
  state: TowerState,
  type: ShaftType,
  range: ShaftRange,
  self: ShaftId | null,
): ErrorCode | null {
  const width = shaftWidth(type);
  const outOfBounds = boundsError(range, width);
  if (outOfBounds) return outOfBounds;

  if (type === 'express' && !(isExpressStop(range.bottom) && isExpressStop(range.top))) {
    return 'EXPRESS_STOP_NOT_ALLOWED';
  }

  const { grid } = state;
  const x1 = range.x + width - 1;
  const levels = shaftLevels(range);
  if (!levels.every((level) => isFreeForShaft(grid, level, range.x, x1, self))) {
    return 'CELL_OCCUPIED';
  }
  if (levels.some((level) => cellsWithoutStructure(grid, level, range.x, x1) > 0)) {
    return 'NO_FLOOR';
  }

  const span = maxSpan(type);
  if (span !== null && levels.length > span) return 'SHAFT_TOO_TALL';

  const tooClose = Object.values(state.shafts).some(
    (other) =>
      other.id !== self &&
      sharesLevel(range, other) &&
      columnGap(range, width, other) < MIN_SHAFT_GAP,
  );
  return tooClose ? 'SHAFT_TOO_CLOSE' : null;
}
