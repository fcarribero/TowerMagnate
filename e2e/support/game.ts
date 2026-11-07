import { expect, type Page } from '@playwright/test';
import { registerUser, type TestUser } from './users';

/** Registers a fresh player, which leaves its session cookie in the page's browser context. */
export async function openGame(page: Page): Promise<TestUser> {
  const user = await registerUser(page.request);
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  return user;
}
