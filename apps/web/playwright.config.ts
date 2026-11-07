import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.TM_WEB_PORT) || 5173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `${baseURL}/kit.html`,
    reuseExistingServer: !process.env.CI,
  },
});
