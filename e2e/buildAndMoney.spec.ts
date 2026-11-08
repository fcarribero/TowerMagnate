import { expect, test, type Page } from '@playwright/test';
import { fastForward, openGame } from './support/game';
import { DEBUG_TAG } from './support/target';
import { canvasBox, CENTER_COLUMN, tilePoint } from './support/towerCanvas';

const STEPS_PER_GAME_DAY = 8_640;
const LOBBY_FIRST = CENTER_COLUMN - 16;
const LOBBY_LAST = CENTER_COLUMN + 15;
const OFFICE_COLUMN = LOBBY_FIRST;
const STAIRS_COLUMN = CENTER_COLUMN - 6;
const ELEVATOR_COLUMN = CENTER_COLUMN + 6;

function moneyOf(page: Page): Promise<number> {
  return page.locator('.status-panel__money').innerText().then(parseMoney);
}

function parseMoney(text: string): number {
  const amount = Number(text.replace(/[^\d]/g, ''));
  return text.includes('-') ? -amount : amount;
}

async function chooseTool(page: Page, category: number, tool: string): Promise<void> {
  await page.getByRole('tab').nth(category).click();
  await page.locator(`[data-tool="${tool}"]`).click();
}

async function pointAt(page: Page, column: number, level: number): Promise<void> {
  const box = await canvasBox(page);
  const point = tilePoint(box, column, level);
  await page.mouse.move(box.x + point.x, box.y + point.y);
}

/** Runs the build gesture and returns the cost the game floated next to the pointer. */
async function floatedCost(page: Page, gesture: () => Promise<void>): Promise<number> {
  const before = await moneyOf(page);
  await gesture();
  const label = page.locator('.tm-float-cost').last();
  await expect(label).toBeVisible();
  const cost = -parseMoney(await label.innerText());
  expect(cost).toBeGreaterThan(0);
  await expect.poll(() => moneyOf(page)).toBe(before - cost);
  return cost;
}

async function dragAcross(page: Page, level: number, from: number, to: number): Promise<void> {
  await pointAt(page, from, level);
  await page.mouse.down();
  await pointAt(page, to, level);
  await page.mouse.up();
}

async function clickCell(page: Page, column: number, level: number): Promise<void> {
  await pointAt(page, column, level);
  await page.mouse.down();
  await page.mouse.up();
}

test(
  'building from the toolbar charges the cost on the label and a tenant fills the office',
  { tag: DEBUG_TAG },
  async ({ page }) => {
    await openGame(page);
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.locator('.status-panel__population')).toHaveText(/Población 0$/);

    await chooseTool(page, 0, 'lobby');
    const lobbyCost = await floatedCost(page, () => dragAcross(page, 1, LOBBY_FIRST, LOBBY_LAST));
    expect(lobbyCost).toBe(32 * 5_000);

    await chooseTool(page, 0, 'floor');
    const floorCost = await floatedCost(page, () => dragAcross(page, 2, LOBBY_FIRST, LOBBY_LAST));
    expect(floorCost).toBe(32 * 500);

    await chooseTool(page, 2, 'office');
    const officeCost = await floatedCost(page, () => clickCell(page, OFFICE_COLUMN, 2));
    expect(officeCost).toBe(40_000);

    await chooseTool(page, 1, 'stairs');
    const stairsCost = await floatedCost(page, () => clickCell(page, STAIRS_COLUMN, 1));
    expect(stairsCost).toBe(5_000);

    await chooseTool(page, 1, 'standard-elevator');
    const before = await moneyOf(page);
    await pointAt(page, ELEVATOR_COLUMN, 1);
    await page.mouse.down();
    await pointAt(page, ELEVATOR_COLUMN, 2);
    const dragLabel = page.locator('.tm-drag-label');
    await expect(dragLabel).toBeVisible();
    const shownCost = parseMoney((await dragLabel.innerText()).split(' - ')[1] ?? '');
    await page.mouse.up();
    expect(shownCost).toBe(280_000);
    await expect.poll(() => moneyOf(page)).toBe(before - shownCost);

    await fastForward(page, STEPS_PER_GAME_DAY);
    await expect(page.locator('.status-panel__population')).toHaveText(/Población 6$/);
  },
);
