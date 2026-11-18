import { UNIT_CATALOG, type TowerState, type Unit } from '@tower-magnate/shared';
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

/**
 * The evaluated units that touch a unit: side by side on its level, or on the level right above or
 * below with a column in common.
 */
export function touchingUnits(state: TowerState, unit: Unit): Unit[] {
  return Object.values(state.units).filter(
    (other) =>
      other.id !== unit.id &&
      isEvaluatedUnit(other) &&
      (sideBySide(unit, other) || stacked(unit, other)),
  );
}
