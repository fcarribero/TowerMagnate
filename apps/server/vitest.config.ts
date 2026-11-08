import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    setupFiles: ['./src/testing/fast-argon2.ts'],
    globalSetup: ['./src/testing/shared-postgres.ts'],
    env: { DATABASE_CONNECTION_TIMEOUT_MS: '20000' },
    poolOptions: { forks: { maxForks: 4 } },
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
