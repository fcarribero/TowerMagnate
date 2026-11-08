import {
  NOISE_RULES,
  UNIT_CATALOG,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';

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

function isSourceFor(unit: Unit, source: Unit): boolean {
  const rule = NOISE_RULES[unit.type];
  return (
    rule !== undefined &&
    source.id !== unit.id &&
    rule.sources.includes(source.type) &&
    sharesLevel(unit, source) &&
    gapBetween(unit, source) <= rule.radius
  );
}

/**
 * Noise is a flag, not a sum: one source in range is enough. Sources count whether rented or
 * not. Ruins and housekeeping are never sources, so only the unit lists decide.
 */
export function isNoisy(state: TowerState, unit: Unit): boolean {
  if (!NOISE_RULES[unit.type]) return false;
  return Object.values(state.units).some((source) => isSourceFor(unit, source));
}

function unitsByLevel(state: TowerState): Map<number, Unit[]> {
  const byLevel = new Map<number, Unit[]>();
  for (const unit of Object.values(state.units)) {
    for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
      const onLevel = byLevel.get(level);
      if (onLevel) onLevel.push(unit);
      else byLevel.set(level, [unit]);
    }
  }
  return byLevel;
}

/** The ids of every noisy unit, the same as `isNoisy` on each unit but in one pass per level. */
export function noisyUnitIds(state: TowerState): Set<UnitId> {
  const byLevel = unitsByLevel(state);
  const noisy = new Set<UnitId>();
  for (const unit of Object.values(state.units)) {
    if (!NOISE_RULES[unit.type]) continue;
    for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
      if (byLevel.get(level)?.some((source) => isSourceFor(unit, source))) {
        noisy.add(unit.id);
        break;
      }
    }
  }
  return noisy;
}
