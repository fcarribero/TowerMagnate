import { expect, test, type Locator, type Page } from '@playwright/test';

function windowNamed(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title });
}

async function zIndexOf(locator: Locator): Promise<number> {
  return Number(await locator.evaluate((element) => getComputedStyle(element).zIndex));
}

async function launch(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'UI kit' })
    .getByRole('button', { name: label })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/kit.html');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
});

test('opens, focuses, drags and closes windows with the mouse', async ({ page }) => {
  await launch(page, 'Botones');
  await launch(page, 'Campos');
  const buttons = windowNamed(page, 'Botones');
  const fields = windowNamed(page, 'Campos');
  expect(await zIndexOf(fields)).toBeGreaterThan(await zIndexOf(buttons));

  await buttons.getByText('Clics: 0').click();
  expect(await zIndexOf(buttons)).toBeGreaterThan(await zIndexOf(fields));

  const before = await buttons.boundingBox();
  const grab = await buttons.locator('.tm-window__title').boundingBox();
  if (before === null || grab === null) {
    throw new Error('window not laid out');
  }
  await page.mouse.move(grab.x + 20, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + 120, grab.y + grab.height / 2 + 80, { steps: 5 });
  await page.mouse.up();
  const after = await buttons.boundingBox();
  expect(after?.x).toBeCloseTo(before.x + 100, 0);
  expect(after?.y).toBeCloseTo(before.y + 80, 0);

  await buttons.getByRole('button', { name: 'Cerrar' }).click();
  await expect(buttons).toHaveCount(0);
});

test('drives the controls with the keyboard', async ({ page }) => {
  await launch(page, 'Botones');
  const buttons = windowNamed(page, 'Botones');
  await buttons.getByRole('button', { name: 'Aplicar' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(buttons.getByText('Clics: 2')).toBeVisible();

  await launch(page, 'Pestañas');
  const tabs = windowNamed(page, 'Pestañas');
  await tabs.getByRole('tab', { name: 'Esta semana' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tabpanel')).toHaveText('Ingresos $9.500');

  await launch(page, 'Lista');
  const list = windowNamed(page, 'Lista').getByRole('listbox');
  await list.focus();
  await page.keyboard.press('End');
  await expect(list.getByRole('option', { selected: true })).toHaveText('Piso 12');

  await launch(page, 'Campos');
  const rent = windowNamed(page, 'Campos').getByLabel('Alquiler (miles)');
  await rent.focus();
  await page.keyboard.press('ArrowUp');
  await expect(rent).toHaveValue('11');
});

test('closes the front window with Esc but not while typing', async ({ page }) => {
  await launch(page, 'Botones');
  await launch(page, 'Campos');
  const fields = windowNamed(page, 'Campos');
  const name = fields.getByLabel('Nombre');
  await name.click();
  await page.keyboard.type('Torre - 1');
  await page.keyboard.press('Escape');
  await expect(name).toHaveValue('Torre - 1');
  await expect(page.getByText('Zoom 2x', { exact: false })).toBeVisible();

  await fields.locator('.tm-window__title-text').click();
  await page.keyboard.press('Escape');
  await expect(fields).toHaveCount(0);
  await expect(windowNamed(page, 'Botones')).toBeVisible();
});

test('shows a tooltip after the pointer rests on a button', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Torre nueva' });
  await opener.hover();
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'Abre el diálogo' });
  await expect(tooltip).toBeVisible();
  const describedBy = await opener.getAttribute('aria-describedby');
  expect(describedBy).toBe(await tooltip.getAttribute('id'));
  await page.mouse.move(5, 5);
  await expect(tooltip).toBeHidden();
});

test('answers a decision dialog that ignores Esc', async ({ page }) => {
  await launch(page, 'Amenaza de bomba');
  const dialog = windowNamed(page, 'Amenaza de bomba');
  await expect(dialog.getByText('Respondé antes de las 13:00')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'No pagar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await launch(page, 'Botones');
  expect(await zIndexOf(dialog)).toBeGreaterThan(await zIndexOf(windowNamed(page, 'Botones')));

  await dialog.getByRole('button', { name: 'Pagar $300.000' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Respuesta: pay')).toBeVisible();
});

test('a confirm dialog is modal, centered, keeps Tab inside and Esc picks the safe option', async ({
  page,
}) => {
  const opener = page.getByRole('button', { name: 'Torre nueva' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'Torre nueva' });
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  const view = await page.locator('.kit-demo__view').boundingBox();
  const box = await dialog.boundingBox();
  if (view === null || box === null) {
    throw new Error('dialog not laid out');
  }
  expect(Math.abs(box.x + box.width / 2 - (view.x + view.width / 2))).toBeLessThan(2);

  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate((element) => element.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  await page.locator('.tm-modal-backdrop').click({ position: { x: 5, y: 5 } });
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Shift+Tab');
    const inside = await dialog.evaluate((element) => element.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  await page.getByRole('button', { name: 'Botones' }).click({ force: true });
  await expect(windowNamed(page, 'Botones')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Respuesta: cancel')).toBeVisible();
  await expect(opener).toBeFocused();
});

test('closes an information dialog with Aceptar', async ({ page }) => {
  await launch(page, 'Bienvenida');
  const dialog = windowNamed(page, 'Bienvenida');
  await expect(dialog.getByRole('button', { name: 'Aceptar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Respuesta: accept')).toBeVisible();
});

test('doubles every UI pixel at UI scale 2', async ({ page }) => {
  await launch(page, 'Botones');
  const button = windowNamed(page, 'Botones').getByRole('button', { name: 'Aplicar' });
  const atScaleOne = await button.boundingBox();
  await page.setViewportSize({ width: 2048, height: 1280 });
  await expect(page.getByText('Escala 2', { exact: false })).toBeVisible();
  const atScaleTwo = await button.boundingBox();
  expect(atScaleTwo?.height).toBe((atScaleOne?.height ?? 0) * 2);
});

test('asks for a bigger window below 1024 x 640', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await expect(page.getByText('Agrandá la ventana del navegador para jugar.')).toBeVisible();
});

test('loads the three Obra fonts from the app with the Spanish letters and no outside request', async ({
  page,
}) => {
  const outsideRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost')) {
      outsideRequests.push(request.url());
    }
  });
  await page.reload();
  await launch(page, 'Botones');
  const loaded = await page.evaluate(async () => {
    const spanish = 'ñÑáéíóúü¿¡ÁÉÍÓÚ';
    const faces = [
      '400 11px "Archivo Black"',
      '500 9px "Space Grotesk"',
      '700 9px "Space Grotesk"',
      '600 10px "IBM Plex Mono"',
    ];
    await Promise.all(faces.map((face) => document.fonts.load(face, spanish)));
    return faces.map((face) => document.fonts.check(face, spanish));
  });
  expect(loaded).toEqual([true, true, true, true]);
  expect(outsideRequests).toEqual([]);
});
