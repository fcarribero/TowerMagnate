import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

// One postgres container for the whole server test run. Starting a container per test file
// makes the files time out when many of them start together on a busy machine.
export default async function startSharedPostgres(): Promise<() => Promise<void>> {
  if (process.env.TEST_DATABASE_URL) {
    return async () => {};
  }
  const container = await startContainer();
  const url = new URL(container.getConnectionUri());
  // Docker Desktop forwards the IPv6 loopback with a ~40 ms stall on large writes.
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1';
  }
  process.env.TEST_DATABASE_URL = url.toString();
  return async () => {
    await container.stop();
  };
}

const START_ATTEMPTS = 3;

// Docker Desktop sometimes answers a container start with a 500 when the machine is busy.
async function startContainer(): Promise<StartedPostgreSqlContainer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await new PostgreSqlContainer('postgres:16-alpine')
        .withCommand([
          'postgres',
          '-c',
          'fsync=off',
          '-c',
          'synchronous_commit=off',
          '-c',
          'full_page_writes=off',
        ])
        .start();
    } catch (error) {
      if (attempt === START_ATTEMPTS) {
        throw error;
      }
    }
  }
}
