import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const POSTGRES_IMAGE = 'postgres:16-alpine';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

// Set TEST_DATABASE_URL to reuse a running postgres instead of starting a container.
export async function startTestDatabase(): Promise<TestDatabase> {
  const externalUrl = process.env.TEST_DATABASE_URL;
  if (externalUrl) {
    return { url: externalUrl, stop: async () => {} };
  }
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_IMAGE,
  ).start();
  return { url: container.getConnectionUri(), stop: async () => void (await container.stop()) };
}
