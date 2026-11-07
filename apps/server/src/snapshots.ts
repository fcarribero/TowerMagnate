import { deserializeState, serializeState } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';
import type pg from 'pg';

/** How many snapshots each tower keeps. Older ones are deleted on save. */
export const SNAPSHOTS_KEPT = 3;

/** Tower ids are postgres bigints, which `pg` hands over as strings. */
export type TowerId = string;

export interface TowerSnapshot {
  towerId: TowerId;
  step: number;
  state: TowerState;
  savedAt: Date;
}

export interface SnapshotRepository {
  /** Stores the state under its step, replacing a snapshot already saved at that step. */
  save(towerId: TowerId, state: TowerState): Promise<void>;
  /** The snapshot with the highest step, or null when the tower has never been saved. */
  loadLatest(towerId: TowerId): Promise<TowerSnapshot | null>;
}

const UPSERT_SNAPSHOT = `
  insert into tower_snapshots (tower_id, step, state)
  values ($1, $2, $3::json)
  on conflict (tower_id, step) do update set state = excluded.state, saved_at = now()
`;

const PRUNE_OLD_SNAPSHOTS = `
  delete from tower_snapshots
  where tower_id = $1
    and step < (
      select min(step) from (
        select step from tower_snapshots where tower_id = $1 order by step desc limit $2
      ) as kept
    )
`;

const SELECT_LATEST_SNAPSHOT = `
  select step, state::text as state, saved_at
  from tower_snapshots
  where tower_id = $1
  order by step desc
  limit 1
`;

interface SnapshotRow {
  step: string;
  state: string;
  saved_at: Date;
}

export function createSnapshotRepository(pool: pg.Pool): SnapshotRepository {
  return {
    save: (towerId, state) => saveSnapshot(pool, towerId, state),
    loadLatest: (towerId) => loadLatestSnapshot(pool, towerId),
  };
}

async function saveSnapshot(pool: pg.Pool, towerId: TowerId, state: TowerState): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(UPSERT_SNAPSHOT, [towerId, state.step, serializeState(state)]);
    await client.query(PRUNE_OLD_SNAPSHOTS, [towerId, SNAPSHOTS_KEPT]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function loadLatestSnapshot(pool: pg.Pool, towerId: TowerId): Promise<TowerSnapshot | null> {
  const result = await pool.query<SnapshotRow>(SELECT_LATEST_SNAPSHOT, [towerId]);
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    towerId,
    step: Number(row.step),
    state: deserializeState(row.state),
    savedAt: row.saved_at,
  };
}
