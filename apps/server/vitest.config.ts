import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
