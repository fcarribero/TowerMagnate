import { expect, test } from '@playwright/test';
import { openGame } from './support/game';

test('the web app loads and reaches the server through its proxy', async ({ page, request }) => {
  await openGame(page);
  await expect(page).toHaveTitle(/Broken on purpose/);

  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: 'ok', database: 'ok' });
});
