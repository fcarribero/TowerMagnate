import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tower-magnate/art',
    testTimeout: 60_000,
  },
});
