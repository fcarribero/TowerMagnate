import type { TowerState } from '@tower-magnate/shared';
import { completeSite } from '../construction';
import { cloneState } from '../state';

/** A copy of the tower where every construction site is finished, for tests that need the units. */
export function finishSites(tower: TowerState): TowerState {
  const ids = Object.keys(tower.sites);
  if (ids.length === 0) return tower;
  const copy = cloneState(tower);
  for (const id of ids) completeSite(copy, id);
  return copy;
}
