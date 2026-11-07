import { performance } from 'node:perf_hooks';
import { createTower, serializeState } from '@tower-magnate/engine';
import type { TowerState, Unit } from '@tower-magnate/shared';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSnapshotRepository, SNAPSHOTS_KEPT, type SnapshotRepository } from './snapshots';
import { startTestDatabase, type TestDatabase } from './testing/database';

const ONE_MEGABYTE = 1024 * 1024;
const SAVE_BUDGET_MS = 50;
const SAVE_ATTEMPTS = 7;

function towerAtStep(step: number, seed = 7): TowerState {
  return { ...createTower(seed), step };
}

function towerOfAtLeast(bytes: number): TowerState {
  const tower = towerAtStep(500);
  const padding = 'x'.repeat(200);
  let index = 0;
  while (serializeState(tower).length < bytes) {
    for (let batch = 0; batch < 1000; batch++) {
      index += 1;
      const unit: Unit = {
        id: `u${index}`,
        type: 'office',
        x: index,
        level: 1,
        name: `${padding}${index}`,
      };
      tower.units[unit.id] = unit;
    }
  }
  return tower;
}

describe('snapshot repository', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let repository: SnapshotRepository;
  let towerId: string;
  let userCount = 0;

  async function insertReturningId(sql: string, values: unknown[]): Promise<string> {
    const result = await pool.query<{ id: string }>(sql, values);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`No id returned by: ${sql}`);
    }
    return row.id;
  }

  async function createTowerRow(): Promise<string> {
    userCount += 1;
    const userId = await insertReturningId(
      `insert into users (username, password_hash) values ($1, 'hash') returning id`,
      [`player${userCount}`],
    );
    return insertReturningId('insert into towers (user_id, seed) values ($1, 7) returning id', [
      userId,
    ]);
  }

  async function storedSteps(id: string): Promise<number[]> {
    const result = await pool.query<{ step: string }>(
      'select step from tower_snapshots where tower_id = $1 order by step',
      [id],
    );
    return result.rows.map((row) => Number(row.step));
  }

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
    repository = createSnapshotRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await database?.stop();
  });

  beforeEach(async () => {
    towerId = await createTowerRow();
  });

  it('loads nothing for a tower that was never saved', async () => {
    await expect(repository.loadLatest(towerId)).resolves.toBeNull();
  });

  it('loads the state saved at the highest step', async () => {
    await repository.save(towerId, towerAtStep(10, 1));
    await repository.save(towerId, towerAtStep(30, 3));
    await repository.save(towerId, towerAtStep(20, 2));

    const latest = await repository.loadLatest(towerId);

    expect(latest?.towerId).toBe(towerId);
    expect(latest?.step).toBe(30);
    expect(latest?.state).toEqual(towerAtStep(30, 3));
    expect(latest?.savedAt).toBeInstanceOf(Date);
  });

  it(`keeps only the last ${SNAPSHOTS_KEPT} snapshots`, async () => {
    for (const step of [1, 2, 3, 4, 5]) {
      await repository.save(towerId, towerAtStep(step));
    }

    expect(await storedSteps(towerId)).toEqual([3, 4, 5]);
  });

  it('replaces a snapshot saved again at the same step', async () => {
    await repository.save(towerId, towerAtStep(8, 1));
    await repository.save(towerId, towerAtStep(8, 2));

    expect(await storedSteps(towerId)).toEqual([8]);
    expect((await repository.loadLatest(towerId))?.state).toEqual(towerAtStep(8, 2));
  });

  it('never prunes newer snapshots when an older step is saved', async () => {
    for (const step of [10, 20, 30]) {
      await repository.save(towerId, towerAtStep(step));
    }
    await repository.save(towerId, towerAtStep(5));

    expect(await storedSteps(towerId)).toEqual([10, 20, 30]);
  });

  it('leaves the snapshots of other towers alone', async () => {
    const otherTowerId = await createTowerRow();
    await repository.save(otherTowerId, towerAtStep(1));
    for (const step of [1, 2, 3, 4]) {
      await repository.save(towerId, towerAtStep(step));
    }

    expect(await storedSteps(otherTowerId)).toEqual([1]);
    expect((await repository.loadLatest(otherTowerId))?.step).toBe(1);
  });

  it(`saves a 1 MB state in under ${SAVE_BUDGET_MS} ms`, async () => {
    const bigTower = towerOfAtLeast(ONE_MEGABYTE);
    await repository.save(towerId, { ...bigTower, step: 1 });

    // Docker Desktop port forwarding adds tens of milliseconds to some 1 MB transfers,
    // so the fastest of several saves is the one that measures the repository.
    let fastestMs = Infinity;
    for (let step = 2; step <= SAVE_ATTEMPTS + 1; step++) {
      const started = performance.now();
      await repository.save(towerId, { ...bigTower, step });
      fastestMs = Math.min(fastestMs, performance.now() - started);
    }

    expect(fastestMs).toBeLessThan(SAVE_BUDGET_MS);
    const latest = await repository.loadLatest(towerId);
    expect(latest?.state).toEqual({ ...bigTower, step: SAVE_ATTEMPTS + 1 });
  });
});
