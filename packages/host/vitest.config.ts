import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tower-magnate/host',
    testTimeout: 30_000,
  },
});
