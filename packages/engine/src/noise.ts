import { NOISE_RULES, UNIT_CATALOG, type TowerState, type Unit } from '@tower-magnate/shared';

function floorsOf(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return height.kind === 'fixed' ? height.floors : 1;
}

function lastColumn(unit: Unit): number {
  return unit.x + UNIT_CATALOG[unit.type].width - 1;
}

/** Empty columns between two units on the same level; 0 when they touch. */
function gapBetween(unit: Unit, source: Unit): number {
  if (source.x > unit.x) {
    return source.x - lastColumn(unit) - 1;
  }
  return unit.x - lastColumn(source) - 1;
}

function sharesLevel(unit: Unit, source: Unit): boolean {
  const unitTop = unit.level + floorsOf(unit) - 1;
  const sourceTop = source.level + floorsOf(source) - 1;
  return source.level <= unitTop && unit.level <= sourceTop;
}

/**
 * Noise is a flag, not a sum: one source in range is enough. Sources count whether rented or
 * not. Ruins and housekeeping are never sources, so only the unit lists decide.
 */
export function isNoisy(state: TowerState, unit: Unit): boolean {
  const rule = NOISE_RULES[unit.type];
  if (!rule) {
    return false;
  }
  return Object.values(state.units).some(
    (source) =>
      source.id !== unit.id &&
      rule.sources.includes(source.type) &&
      sharesLevel(unit, source) &&
      gapBetween(unit, source) <= rule.radius,
  );
}
