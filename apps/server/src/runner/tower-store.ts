import { createTower } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';
import type pg from 'pg';
import type { SnapshotRepository, TowerId } from '../snapshots';

export interface TowerStore {
  /** The latest saved state, a fresh tower from its seed when never saved, or null when unknown. */
  load(towerId: TowerId): Promise<TowerState | null>;
  save(towerId: TowerId, state: TowerState): Promise<void>;
}

export function createTowerStore(pool: pg.Pool, snapshots: SnapshotRepository): TowerStore {
  return {
    load: async (towerId) => {
      const snapshot = await snapshots.loadLatest(towerId);
      if (snapshot) {
        return snapshot.state;
      }
      const seed = await readTowerSeed(pool, towerId);
      return seed === null ? null : createTower(seed);
    },
    save: (towerId, state) => snapshots.save(towerId, state),
  };
}

async function readTowerSeed(pool: pg.Pool, towerId: TowerId): Promise<number | null> {
  const result = await pool.query<{ seed: string }>('select seed from towers where id = $1', [
    towerId,
  ]);
  const row = result.rows[0];
  return row === undefined ? null : Number(row.seed);
}
