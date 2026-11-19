import type { TowerState } from '@tower-magnate/shared';

export interface TowerStore {
  /** The latest saved state, a fresh tower from its seed when never saved, or null when unknown. */
  load(towerId: string): Promise<TowerState | null>;
  save(towerId: string, state: TowerState): Promise<void>;
}
