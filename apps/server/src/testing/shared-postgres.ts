import { PostgreSqlContainer } from '@testcontainers/postgresql';

// One postgres container for the whole server test run. Starting a container per test file
// makes the files time out when many of them start together on a busy machine.
export default async function startSharedPostgres(): Promise<() => Promise<void>> {
  if (process.env.TEST_DATABASE_URL) {
    return async () => {};
  }
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
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
