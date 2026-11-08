import { createTower, newUnit, serializeState } from '@tower-magnate/engine';
import type { TowerState, Unit } from '@tower-magnate/shared';

export const ONE_MEGABYTE = 1024 * 1024;

export function towerAtStep(step: number, seed = 7): TowerState {
  return { ...createTower(seed), step };
}

export function towerOfAtLeast(bytes: number): TowerState {
  const tower = towerAtStep(500);
  const padding = 'x'.repeat(200);
  let index = 0;
  while (serializeState(tower).length < bytes) {
    for (let batch = 0; batch < 1000; batch++) {
      index += 1;
      const unit: Unit = {
        ...newUnit(`u${index}`, 'office', index, 1),
        name: `${padding}${index}`,
      };
      tower.units[unit.id] = unit;
    }
  }
  return tower;
}
