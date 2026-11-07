import type { EntityId, Level, TowerState } from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';

export interface TowerSummary {
  day: number;
  builtLevels: Level[];
  unitIds: EntityId[];
  shaftIds: EntityId[];
}

/** What a scenario usually asserts on, read from the state in a stable order. */
export function summarizeTower(state: TowerState): TowerSummary {
  const builtLevels: Level[] = [];
  const unitIds = new Set<EntityId>();
  const shaftIds = new Set<EntityId>();
  for (const [key, row] of Object.entries(state.grid.levels)) {
    if (!row) continue;
    if (row.structure.length > 0) builtLevels.push(Number(key));
    for (const span of row.occupants) {
      if (span.occupant.kind === 'unit') unitIds.add(span.occupant.id);
      if (span.occupant.kind === 'shaft') shaftIds.add(span.occupant.id);
    }
  }
  return {
    day: Math.floor(state.step / STEPS_PER_DAY),
    builtLevels: builtLevels.sort((a, b) => a - b),
    unitIds: [...unitIds].sort(byIdNumber),
    shaftIds: [...shaftIds].sort(byIdNumber),
  };
}

function byIdNumber(a: EntityId, b: EntityId): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}
