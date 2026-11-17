import { UNIT_CATALOG, type TowerState, type Unit } from '@tower-magnate/shared';

/** The unit spans of the tower at one step, for telling a cell inside a unit from a corridor. */
export interface Ambient {
  /** True when the cell is inside a unit: walking there adds no stress. */
  insideUnit(level: number, column: number): boolean;
}

function floorsOf(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return height.kind === 'fixed' ? height.floors : 1;
}

export function buildAmbient(state: TowerState): Ambient {
  const inside = new Map<number, number[]>();
  for (const unit of Object.values(state.units)) {
    const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
    for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
      const spans = inside.get(level);
      if (spans) spans.push(unit.x, last);
      else inside.set(level, [unit.x, last]);
    }
  }
  return {
    insideUnit(level, column) {
      const spans = inside.get(level);
      if (!spans) return false;
      for (let at = 0; at < spans.length; at += 2) {
        if (column >= (spans[at] as number) && column <= (spans[at + 1] as number)) return true;
      }
      return false;
    },
  };
}

const memo = new WeakMap<TowerState['units'], { count: number; nextId: number; ambient: Ambient }>();

function countOf(units: TowerState['units']): number {
  let count = 0;
  for (const _ in units) count++;
  return count;
}

/**
 * The spans of this tower, rebuilt when units are added or removed. Units never move once built.
 */
export function ambientOf(state: TowerState): Ambient {
  const count = countOf(state.units);
  const kept = memo.get(state.units);
  if (kept && kept.count === count && kept.nextId === state.nextId) return kept.ambient;
  const ambient = buildAmbient(state);
  memo.set(state.units, { count, nextId: state.nextId, ambient });
  return ambient;
}
