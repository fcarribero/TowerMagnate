import type { CellRange, Level, TowerState } from '@tower-magnate/shared';
import { addOccupant, occupantAt, structureAt } from '../grid';
import { walkableRuns } from '../routing/walkable-runs';
import { writableGrid } from '../step-copy';
import { isOnTrek } from '../trek';
import { destroyUnit } from './bomb';

/** What burned at one step: the cells that became ruins and whether a unit was destroyed. */
export interface FireDamage {
  cells: CellRange[];
  destroyedUnit: boolean;
}

export function noDamage(): FireDamage {
  return { cells: [], destroyedUnit: false };
}

/** The walkable column nearest `x` on the level, the lower column on a tie; null when none. */
export function nearestWalkableColumn(state: TowerState, level: Level, x: number): number | null {
  let best: number | null = null;
  for (const run of walkableRuns(state, level)) {
    const column = Math.min(Math.max(x, run.x0), run.x1);
    if (best === null || Math.abs(column - x) < Math.abs(best - x)) best = column;
  }
  return best;
}

/**
 * Routing 2.2: a person standing on a cell that turned to ruins moves to the nearest walkable
 * cell of the level. People on a trip keep going; their trek moves them.
 */
function moveOffRuins(state: TowerState, ruined: readonly CellRange[]): void {
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isOnTrek(pool, slot)) continue;
    const level = pool.level[slot] as number;
    const column = pool.column[slot] as number;
    const onRuins = ruined.some(
      (cell) => cell.level === level && column >= cell.x0 && column <= cell.x1,
    );
    if (!onRuins) continue;
    const to = nearestWalkableColumn(state, level, column);
    if (to !== null) pool.column[slot] = to;
  }
}

/**
 * Events 5.5: a burning cell destroys the unit on it, or turns an empty structure cell to ruins.
 * Stairs, escalators, shafts, ruins and the cathedral are left as they are.
 */
export function burnCell(state: TowerState, level: Level, x: number, damage: FireDamage): void {
  const occupant = occupantAt(state.grid, level, x);
  let ruined: CellRange[] = [];
  if (occupant === null) {
    if (structureAt(state.grid, level, x) === null) return;
    addOccupant(writableGrid(state), level, x, x, { kind: 'ruins' });
    ruined = [{ level, x0: x, x1: x }];
  } else if (occupant.kind === 'unit') {
    const unit = state.units[occupant.id];
    if (!unit || unit.type === 'cathedral') return;
    ruined = destroyUnit(state, unit);
    damage.destroyedUnit = true;
  }
  if (ruined.length === 0) return;
  damage.cells.push(...ruined);
  moveOffRuins(state, ruined);
}
