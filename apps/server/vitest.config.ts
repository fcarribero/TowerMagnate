import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    globalSetup: ['./src/testing/shared-postgres.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
