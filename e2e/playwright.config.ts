import { defineConfig, devices } from '@playwright/test';
import { DEBUG_TAG, resolveE2eTarget } from './support/target';

const target = resolveE2eTarget(process.env);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  grepInvert: target.debugCommands ? undefined : new RegExp(DEBUG_TAG),
  outputDir: 'test-results',
  globalSetup: './global-setup.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: target.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
