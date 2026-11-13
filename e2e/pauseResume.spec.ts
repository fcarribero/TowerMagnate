import { expect, test, type Page } from '@playwright/test';
import { openGame } from './support/game';

const CLOSED_TAB_WAIT_MS = 30_000;
const MINUTES_PER_DAY = 24 * 60;
// A running tower gains 48 game minutes in 30 s, so a few minutes still proves it was paused.
const MAX_DRIFT_MINUTES = 5;

async function readGameMinutes(page: Page): Promise<number> {
  const bar = page.getByRole('toolbar', { name: 'Barra de estado' });
  const dayOfMonth = Number(
    /(\d+) de/i.exec(await bar.locator('.status-panel__day').innerText())?.[1],
  );
  const [hours = 0, minutes = 0] = (await bar.locator('.status-panel__time').innerText())
    .split(':')
    .map(Number);
  return dayOfMonth * MINUTES_PER_DAY + hours * 60 + minutes;
}

test('the tower is paused while no tab is open and resumes from the same instant', async ({
  page,
  context,
}) => {
  test.setTimeout(CLOSED_TAB_WAIT_MS + 60_000);
  await openGame(page);

  const start = await readGameMinutes(page);
  await expect.poll(() => readGameMinutes(page)).toBeGreaterThan(start);
  const beforeClose = await readGameMinutes(page);

  await page.close();
  await new Promise((resolve) => setTimeout(resolve, CLOSED_TAB_WAIT_MS));

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('#app canvas')).toBeVisible();
  const afterReopen = await readGameMinutes(reopened);

  // One game minute is about 0.6 s, so page close and reopen time on a slow runner adds a few.
  expect(afterReopen).toBeGreaterThanOrEqual(beforeClose);
  expect(afterReopen - beforeClose).toBeLessThanOrEqual(MAX_DRIFT_MINUTES);
});
