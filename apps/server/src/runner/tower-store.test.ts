import { createTower } from '@tower-magnate/engine';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createSnapshotRepository, type SnapshotRepository } from '../snapshots';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { TestSocketClient } from '../testing/socket-client';
import { createPlayer } from '../testing/tower-rows';
import { towerAtStep } from '../testing/towers';
import { createTowerStore, type TowerStore } from './tower-store';

const MISSING_TOWER_ID = '999999';

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(await condition()).toBe(true);
}

describe('tower store and runner against postgres', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let snapshots: SnapshotRepository;
  let store: TowerStore;
  let towerId: string;
  let cookie: string;

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
    snapshots = createSnapshotRepository(pool);
    store = createTowerStore(pool, snapshots);
  });

  afterAll(async () => {
    await pool?.end();
    await database?.stop();
  });

  beforeEach(async () => {
    ({ towerId, cookie } = await createPlayer(pool));
  });

  it('starts a never saved tower from its seed', async () => {
    await expect(store.load(towerId)).resolves.toEqual(createTower(7));
  });

  it('loads the latest snapshot of a saved tower', async () => {
    await store.save(towerId, towerAtStep(40));
    await store.save(towerId, towerAtStep(90));

    const state = await store.load(towerId);

    expect(state?.step).toBe(90);
  });

  it('loads nothing for a tower that does not exist', async () => {
    await expect(store.load(MISSING_TOWER_ID)).resolves.toBeNull();
  });

  describe('through the websocket endpoint', () => {
    let app: FastifyInstance;
    let baseUrl: string;

    beforeAll(async () => {
      app = buildApp({ version: 'test', databaseUrl: database.url, runnerTickIntervalMs: 20 });
      baseUrl = (await app.listen({ host: '127.0.0.1', port: 0 })).replace('http', 'ws');
    });

    afterAll(async () => {
      await app?.close();
    });

    async function connect(): Promise<TestSocketClient> {
      const client = await TestSocketClient.open(`${baseUrl}/ws`, cookie);
      client.hello();
      await client.next('snapshot');
      return client;
    }

    it('runs the tower while a socket is open and saves it when the last one closes', async () => {
      const first = await connect();
      const second = await connect();
      await waitFor(() => (app.towerRunner.stateOf(towerId)?.step ?? 0) > 0);

      await first.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(app.towerRunner.isRunning(towerId)).toBe(true);

      await second.close();
      await waitFor(() => !app.towerRunner.isRunning(towerId));
      await waitFor(async () => (await snapshots.loadLatest(towerId)) !== null);

      const saved = await snapshots.loadLatest(towerId);
      expect(saved?.step).toBeGreaterThan(0);
    });
  });
});
