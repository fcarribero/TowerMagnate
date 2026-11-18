import { UNIT_CATALOG, type TowerState, type Unit, type UnitId } from '@tower-magnate/shared';
import { isEvaluatedUnit } from './unit-evaluation';

function topLevel(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return unit.level + (height.kind === 'fixed' ? height.floors : 1) - 1;
}

function lastColumn(unit: Unit): number {
  return unit.x + UNIT_CATALOG[unit.type].width - 1;
}

function sharesLevel(a: Unit, b: Unit): boolean {
  return a.level <= topLevel(b) && b.level <= topLevel(a);
}

function sharesColumn(a: Unit, b: Unit): boolean {
  return a.x <= lastColumn(b) && b.x <= lastColumn(a);
}

/** Wall to wall on the same level: no empty column between them. */
function sideBySide(a: Unit, b: Unit): boolean {
  return sharesLevel(a, b) && (lastColumn(a) + 1 === b.x || lastColumn(b) + 1 === a.x);
}

/** One right on top of the other, with at least one column in common. */
function stacked(a: Unit, b: Unit): boolean {
  return sharesColumn(a, b) && (topLevel(a) + 1 === b.level || topLevel(b) + 1 === a.level);
}

/** The evaluated units of the tower by each level they cover, for many neighbor lookups at once. */
export type LevelIndex = ReadonlyMap<number, readonly UnitId[]>;

export function evaluatedByLevel(state: TowerState): LevelIndex {
  const index = new Map<number, UnitId[]>();
  for (const unit of Object.values(state.units)) {
    if (!isEvaluatedUnit(unit)) continue;
    for (let level = unit.level; level <= topLevel(unit); level++) {
      const ids = index.get(level);
      if (ids) ids.push(unit.id);
      else index.set(level, [unit.id]);
    }
  }
  return index;
}

/** The units that could touch a unit: those on its levels and the levels right above and below. */
function candidates(state: TowerState, unit: Unit, index: LevelIndex | undefined): Unit[] {
  if (!index) return Object.values(state.units);
  const ids = new Set<UnitId>();
  for (let level = unit.level - 1; level <= topLevel(unit) + 1; level++) {
    for (const id of index.get(level) ?? []) ids.add(id);
  }
  return [...ids].flatMap((id) => state.units[id] ?? []);
}

/**
 * The evaluated units that touch a unit: side by side on its level, or on the level right above or
 * below with a column in common. `index` from `evaluatedByLevel` saves the scan of every unit.
 */
export function touchingUnits(state: TowerState, unit: Unit, index?: LevelIndex): Unit[] {
  return candidates(state, unit, index).filter(
    (other) =>
      other.id !== unit.id &&
      isEvaluatedUnit(other) &&
      (sideBySide(unit, other) || stacked(unit, other)),
  );
}
