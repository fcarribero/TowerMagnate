import { disconnectedUnits } from '@tower-magnate/engine';
import type { TowerState, UnitId } from '@tower-magnate/shared';
import type { TowerRunner } from '../runner';
import type { TowerId } from '../snapshots';

interface KeptResult {
  layoutVersion: number;
  units: ReadonlySet<UnitId>;
}

export type FindDisconnectedUnits = (state: TowerState) => ReadonlySet<UnitId>;

/**
 * The disconnected units of each running tower, worked out once per layout version and shared
 * by every socket of that tower.
 */
export class DisconnectedUnitsCache {
  private readonly kept = new Map<TowerId, KeptResult>();

  constructor(
    private readonly runner: TowerRunner,
    private readonly find: FindDisconnectedUnits = disconnectedUnits,
  ) {}

  of(towerId: TowerId, state: TowerState): ReadonlySet<UnitId> {
    const layoutVersion = this.runner.layoutVersionOf(towerId);
    if (layoutVersion === undefined) {
      this.kept.delete(towerId);
      return this.find(state);
    }
    const known = this.kept.get(towerId);
    if (known?.layoutVersion === layoutVersion) {
      return known.units;
    }
    const units = this.find(state);
    this.kept.set(towerId, { layoutVersion, units });
    return units;
  }

  /** Drops the results of towers that stopped running. */
  keepOnly(runningTowers: readonly TowerId[]): void {
    const running = new Set(runningTowers);
    for (const towerId of this.kept.keys()) {
      if (!running.has(towerId)) this.kept.delete(towerId);
    }
  }
}
