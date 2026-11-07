import { expect, type Page } from '@playwright/test';

export async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
}
