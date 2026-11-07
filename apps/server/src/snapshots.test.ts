import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSnapshotRepository, SNAPSHOTS_KEPT, type SnapshotRepository } from './snapshots';
import { startTestDatabase, type TestDatabase } from './testing/database';
import { createTowerRow } from './testing/tower-rows';
import { ONE_MEGABYTE, towerAtStep, towerOfAtLeast } from './testing/towers';

describe('snapshot repository', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let repository: SnapshotRepository;
  let towerId: string;

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
    towerId = await createTowerRow(pool);
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
    const otherTowerId = await createTowerRow(pool);
    await repository.save(otherTowerId, towerAtStep(1));
    for (const step of [1, 2, 3, 4]) {
      await repository.save(towerId, towerAtStep(step));
    }

    expect(await storedSteps(otherTowerId)).toEqual([1]);
    expect((await repository.loadLatest(otherTowerId))?.step).toBe(1);
  });

  it('saves and loads back a 1 MB state', async () => {
    const bigTower = towerOfAtLeast(ONE_MEGABYTE);

    await repository.save(towerId, bigTower);

    expect((await repository.loadLatest(towerId))?.state).toEqual(bigTower);
  });
});
