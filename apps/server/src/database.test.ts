import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool, pingDatabase } from './database';
import { startTestDatabase, type TestDatabase } from './testing/database';

function fakeLogger(): FastifyBaseLogger {
  return { error: vi.fn() } as unknown as FastifyBaseLogger;
}

async function terminateOtherConnections(databaseUrl: string): Promise<void> {
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await admin.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()',
    );
  } finally {
    await admin.end();
  }
}

describe('createPool', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('logs and recovers when an idle connection is terminated', async () => {
    const logger = fakeLogger();
    const pool = createPool(database.url, logger);
    try {
      await pingDatabase(pool);
      await terminateOtherConnections(database.url);

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());
      await expect(pingDatabase(pool)).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});
