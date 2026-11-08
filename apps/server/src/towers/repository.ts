import { randomInt } from 'node:crypto';
import { createTower, dateOfStep, deserializeState, serializeState } from '@tower-magnate/engine';
import type { TowerState, TowerSummary } from '@tower-magnate/shared';
import pg from 'pg';

const SEED_LIMIT = 2 ** 32;
const UNIQUE_VIOLATION = '23505';

export class TowerExistsError extends Error {
  constructor(userId: number) {
    super(`User ${userId} already has a tower`);
    this.name = 'TowerExistsError';
  }
}

interface TowerRow {
  id: string;
  seed: string;
  created_at: Date;
}

interface TowerWithStateRow extends TowerRow {
  state: string | null;
}

const SELECT_TOWER_WITH_LATEST_STATE = `
  select towers.id, towers.seed, towers.created_at, latest.state
  from towers
  left join lateral (
    select state::text as state
    from tower_snapshots
    where tower_snapshots.tower_id = towers.id
    order by step desc
    limit 1
  ) as latest on true
  where towers.user_id = $1
`;

const INSERT_INITIAL_SNAPSHOT = `
  insert into tower_snapshots (tower_id, step, state) values ($1, $2, $3::json)
`;

export async function findTowerSummary(
  pool: pg.Pool,
  userId: number,
): Promise<TowerSummary | undefined> {
  const result = await pool.query<TowerWithStateRow>(SELECT_TOWER_WITH_LATEST_STATE, [userId]);
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  const state = row.state === null ? createTower(Number(row.seed)) : deserializeState(row.state);
  return summarize(row, state);
}

export async function createTowerFor(pool: pg.Pool, userId: number): Promise<TowerSummary> {
  return inTransaction(pool, async (client) => {
    const seed = randomSeed();
    const row = await insertTower(client, userId, seed);
    return startFresh(client, row, seed);
  });
}

/** Deletes every snapshot and starts the tower again from step 0 with a new seed. */
export async function resetTowerOf(
  pool: pg.Pool,
  userId: number,
): Promise<TowerSummary | undefined> {
  return inTransaction(pool, async (client) => {
    const existing = await client.query<TowerRow>(
      'select id, seed, created_at from towers where user_id = $1 for update',
      [userId],
    );
    const tower = existing.rows[0];
    if (!tower) {
      return undefined;
    }
    const seed = randomSeedOtherThan(Number(tower.seed));
    await client.query('delete from tower_snapshots where tower_id = $1', [tower.id]);
    const updated = await client.query<TowerRow>(
      'update towers set seed = $2, created_at = now() where id = $1 returning id, seed, created_at',
      [tower.id, seed],
    );
    const row = firstRow(updated, 'Resetting a tower');
    return startFresh(client, row, seed);
  });
}

async function insertTower(client: pg.PoolClient, userId: number, seed: number): Promise<TowerRow> {
  try {
    const result = await client.query<TowerRow>(
      'insert into towers (user_id, seed) values ($1, $2) returning id, seed, created_at',
      [userId, seed],
    );
    return firstRow(result, 'Inserting a tower');
  } catch (error) {
    if (error instanceof pg.DatabaseError && error.code === UNIQUE_VIOLATION) {
      throw new TowerExistsError(userId);
    }
    throw error;
  }
}

async function startFresh(
  client: pg.PoolClient,
  row: TowerRow,
  seed: number,
): Promise<TowerSummary> {
  const state = createTower(seed);
  await client.query(INSERT_INITIAL_SNAPSHOT, [row.id, state.step, serializeState(state)]);
  return summarize(row, state);
}

function summarize(row: TowerRow, state: TowerState): TowerSummary {
  const date = dateOfStep(state.step);
  return {
    id: Number(row.id),
    step: state.step,
    date: {
      year: date.year,
      month: date.month,
      day: date.day,
      weekday: date.weekday,
      hour: date.hour,
      minute: date.minute,
    },
    money: state.money,
    unitCount: Object.keys(state.units).length,
    createdAt: row.created_at.toISOString(),
  };
}

function firstRow(result: pg.QueryResult<TowerRow>, action: string): TowerRow {
  const row = result.rows[0];
  if (!row) {
    throw new Error(`${action} returned no row`);
  }
  return row;
}

function randomSeed(): number {
  return randomInt(SEED_LIMIT);
}

function randomSeedOtherThan(previous: number): number {
  let seed = randomSeed();
  while (seed === previous) {
    seed = randomSeed();
  }
  return seed;
}

async function inTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
