import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrateDatabase } from '../migrations';

const POSTGRES_IMAGE = 'postgres:16-alpine';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

export interface TestDatabaseOptions {
  migrate?: boolean;
}

// Set TEST_DATABASE_URL to reuse a running postgres instead of starting a container.
// Each call then gets its own empty database on that server, dropped again on stop.
export async function startTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  const externalUrl = process.env.TEST_DATABASE_URL;
  const database = externalUrl
    ? await createScratchDatabase(externalUrl)
    : await startContainerDatabase();
  if (options.migrate) {
    await migrateDatabase(database.url);
  }
  return database;
}

async function startContainerDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  return { url: container.getConnectionUri(), stop: async () => void (await container.stop()) };
}

async function createScratchDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  await runAdminQuery(serverUrl, `create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    stop: () => runAdminQuery(serverUrl, `drop database if exists ${name} with (force)`),
  };
}

async function runAdminQuery(serverUrl: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
