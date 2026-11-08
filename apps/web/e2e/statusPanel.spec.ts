import { expect, test, type Page } from '@playwright/test';

const DUSK = 'rgb(224, 135, 90)';
const CLOTH_RED = 'rgb(176, 53, 58)';
const PANEL_PADDING_AND_BORDER = 2 * 4 + 2 * 2;

function statusBar(page: Page) {
  return page.getByRole('toolbar', { name: 'Barra de estado' });
}

async function widthOf(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
}

async function setBarWidth(page: Page, width: number): Promise<void> {
  await page
    .locator('.kit-demo__status-bar')
    .evaluate((element, px) => (element.style.width = `${px}px`), width);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/kit.html');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
});

test('draws a Saturday in dusk and a negative balance in red', async ({ page }) => {
  const bar = statusBar(page);
  const date = bar.locator('.status-panel__date');
  await expect(date).toHaveText('Sábado 6 de enero, año 1');
  await expect(date).toHaveCSS('color', DUSK);
  await expect(bar.locator('.status-panel__time')).toHaveText('23:59');

  const money = bar.locator('.status-panel__money');
  await expect(money).toHaveText('-$12.500');
  await expect(money).toHaveCSS('color', CLOTH_RED);

  await expect(bar.locator('.status-panel__population')).toHaveText('Población 1.234');
  await expect(bar.locator('.status-panel__star.is-filled')).toHaveCount(5);
  await expect(bar.getByText('TORRE')).toBeVisible();
});

test('moves to Sunday and a positive balance a game minute later', async ({ page }) => {
  await page.getByRole('button', { name: 'Avanzar un minuto' }).click();
  const bar = statusBar(page);
  await expect(bar.locator('.status-panel__date')).toHaveText('Domingo 7 de enero, año 1');
  await expect(bar.locator('.status-panel__time')).toHaveText('00:00');
  const money = bar.locator('.status-panel__money');
  await expect(money).toHaveText('$87.500');
  await expect(money).not.toHaveCSS('color', CLOTH_RED);
});

test('is 24 UI pixels tall', async ({ page }) => {
  const box = await page.locator('.status-panel').boundingBox();
  expect(box?.height).toBe(24);
});

test('moves window buttons into the menu first, then the zoom buttons', async ({ page }) => {
  const bar = statusBar(page);
  const menuButton = bar.getByRole('button', { name: 'Menú' });
  await expect(bar.getByRole('button', { name: 'Finanzas' })).toBeVisible();
  const panelChrome = PANEL_PADDING_AND_BORDER;
  const fullRow = await widthOf(page, '.status-panel__row');
  const groups = page.locator('.status-panel__group');
  const zoomWidth = await groups
    .nth(0)
    .evaluate((element) => element.getBoundingClientRect().width);
  const windowsWidth = await groups
    .nth(1)
    .evaluate((element) => element.getBoundingClientRect().width);

  await setBarWidth(page, fullRow + panelChrome - windowsWidth / 2);
  await expect(bar.getByRole('button', { name: 'Finanzas' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Acercar' })).toBeVisible();
  await menuButton.click();
  await expect(bar.getByRole('menuitem', { name: 'Finanzas' })).toBeVisible();
  await expect(bar.getByRole('menuitem', { name: 'Acercar' })).toHaveCount(0);
  await bar.getByRole('menuitem', { name: 'Avisos' }).click();
  await expect(page.locator('.kit-demo__status .kit-demo__answer')).toHaveText('ventana notices');

  await setBarWidth(page, fullRow + panelChrome - windowsWidth - zoomWidth / 2);
  await expect(bar.getByRole('button', { name: 'Acercar' })).toHaveCount(0);
  await menuButton.click();
  await expect(bar.getByRole('menuitem', { name: 'Acercar' })).toBeVisible();
  await page.keyboard.press('Escape');

  await setBarWidth(page, fullRow + panelChrome + 1);
  await expect(bar.getByRole('button', { name: 'Finanzas' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Acercar' })).toBeVisible();
});
