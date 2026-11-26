import {
  levelAbove,
  UNIT_CATALOG,
  type ErrorCode,
  type Level,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { newUnit } from '../units';
import { unitLevels } from './demolish';

const MAX_RAMPS = 9;

interface Spot {
  x: number;
  level: Level;
}

function unitsOfType(state: TowerState, type: UnitType) {
  return Object.values(state.units).filter((unit) => unit.type === type);
}

/**
 * C-47: a tower has at most 9 ramps. They go on any basement level and need not connect; a ramp
 * with no ramp chain up to S1 is built but shows the no-access sign.
 */
function rampError(state: TowerState): ErrorCode | null {
  return unitsOfType(state, 'parking-ramp').length < MAX_RAMPS ? null : 'LIMIT_REACHED';
}

function footprintOf(spot: Spot) {
  const unit = newUnit('footprint', 'recycling-center', spot.x, spot.level);
  const levels = unitLevels(unit);
  return {
    x0: spot.x,
    x1: spot.x + UNIT_CATALOG['recycling-center'].width - 1,
    bottom: levels[0] as Level,
    top: levels[levels.length - 1] as Level,
    levels,
  };
}

function isBelow(lower: { top: Level }, upper: { bottom: Level }): boolean {
  return levelAbove(lower.top) === upper.bottom;
}

/** C-49: footprints that do not overlap and meet side by side or one above the other. */
function areAdjacent(a: Spot, b: Spot): boolean {
  const first = footprintOf(a);
  const second = footprintOf(b);
  const sharesLevel = first.levels.some((level) => second.levels.includes(level));
  const sharesColumn = first.x0 <= second.x1 && second.x0 <= first.x1;
  const sideBySide = sharesLevel && (first.x1 + 1 === second.x0 || second.x1 + 1 === first.x0);
  const stacked = sharesColumn && (isBelow(first, second) || isBelow(second, first));
  return sideBySide || stacked;
}

function recyclingError(state: TowerState, spot: Spot): ErrorCode | null {
  const existing = unitsOfType(state, 'recycling-center');
  if (existing.length === 0) return null;
  const adjacent = existing.some((center) =>
    areAdjacent({ x: center.x, level: center.level }, spot),
  );
  return adjacent ? null : 'RECYCLING_NOT_ADJACENT';
}

/** Type rules of construction.md 6.2 to 6.4, checked after the shared placement checks. */
export function basementRuleError(state: TowerState, type: UnitType, spot: Spot): ErrorCode | null {
  if (type === 'parking-ramp') return rampError(state);
  if (type === 'recycling-center') return recyclingError(state, spot);
  return null;
}
