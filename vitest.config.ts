import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'packages/*',
      'apps/*',
      'tools/*',
      {
        test: {
          name: 'repo',
          include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts', 'e2e/**/*.test.ts'],
        },
      },
    ],
  },
});
