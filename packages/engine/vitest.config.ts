import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tower-magnate/engine',
    testTimeout: 30_000,
  },
});
