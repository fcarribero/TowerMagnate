import type { Level, UnitView } from '@tower-magnate/shared';
import { UNIT_CATALOG } from '@tower-magnate/shared';
import { indexToLevel, levelToIndex } from './levels';
import { TOWER_WIDTH_TILES } from './metrics';
import { isPlacedUnit } from './unitPlan';

/** Marks a cell that a unit sprite covers. */
export const COVERED = 'u';

/**
 * For each level a placed unit stands on, a row of the same width as the structure row with
 * `COVERED` on every cell under a unit. The structure layer draws no floor there, because the
 * unit sprite brings its own floor and slab and its windows are transparent.
 */
export function coveredRows(
  units: Iterable<Pick<UnitView, 'type' | 'x' | 'level'>>,
): Map<Level, string> {
  const rows = new Map<Level, string[]>();
  for (const unit of units) {
    if (!isPlacedUnit(unit.type)) {
      continue;
    }
    const definition = UNIT_CATALOG[unit.type];
    const floors = definition.height.kind === 'fixed' ? definition.height.floors : 1;
    const bottom = levelToIndex(unit.level);
    for (let index = bottom; index < bottom + floors; index += 1) {
      const level = indexToLevel(index);
      const row = rows.get(level) ?? Array.from({ length: TOWER_WIDTH_TILES }, () => '.');
      for (let x = unit.x; x < unit.x + definition.width && x < TOWER_WIDTH_TILES; x += 1) {
        row[x] = COVERED;
      }
      rows.set(level, row);
    }
  }
  return new Map([...rows].map(([level, row]) => [level, row.join('')]));
}

/** `next` with every row replaced by the equal row of `previous`, and `previous` itself when nothing differs. */
export function reuseEqualRows(
  previous: ReadonlyMap<Level, string> | undefined,
  next: Map<Level, string>,
): ReadonlyMap<Level, string> {
  if (previous === undefined) {
    return next;
  }
  const same =
    previous.size === next.size && [...next].every(([level, row]) => previous.get(level) === row);
  return same ? previous : next;
}
