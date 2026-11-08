import { expect, test, type Page } from '@playwright/test';
import { registerUser, uniqueUser } from './support/users';

const canvas = (page: Page) => page.locator('#app canvas');
const loginButton = (page: Page) => page.getByRole('button', { name: 'Entrar', exact: true });

test('a new player registers, keeps the session on reload and logs out', async ({ page }) => {
  const user = uniqueUser();
  await page.goto('/');
  await expect(loginButton(page)).toBeVisible();

  await page.getByRole('button', { name: '¿No tenés cuenta? Creá una' }).click();
  await page.getByLabel('Usuario').fill(user.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByLabel('Repetir contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(canvas(page)).toBeVisible();

  await page.reload();
  await expect(canvas(page)).toBeVisible();
  await expect(loginButton(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Menú' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(loginButton(page)).toBeVisible();
  await page.reload();
  await expect(loginButton(page)).toBeVisible();
});

test('a wrong password shows a Spanish message and a right one enters', async ({
  page,
  browser,
}) => {
  const anotherContext = await browser.newContext();
  const user = await registerUser(anotherContext.request);
  await anotherContext.close();

  await page.goto('/');
  await page.getByLabel('Usuario').fill(user.username);
  await page.getByLabel('Contraseña').fill('no-es-la-clave');
  await page.getByLabel('Contraseña').press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos.');

  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByLabel('Contraseña').press('Enter');
  await expect(canvas(page)).toBeVisible();
});

test('a taken username and bad fields get messages under their fields', async ({
  page,
  request,
}) => {
  const taken = await registerUser(request);
  await page.goto('/');
  await page.getByRole('button', { name: '¿No tenés cuenta? Creá una' }).click();

  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Completá este campo.')).toHaveCount(3);

  await page.getByLabel('Usuario').fill(taken.username);
  await page.getByLabel('Contraseña', { exact: true }).fill('otra-clave-1');
  await page.getByLabel('Repetir contraseña').fill('otra-clave-1');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ese usuario ya existe. Probá con otro.')).toBeVisible();
});
