import { expect, test } from '@playwright/test';
import { GAME_LOAD_TIMEOUT_MS, openGame, readTowerState, sendCommand } from './support/game';
import { DEBUG_TAG } from './support/target';
import { CENTER_COLUMN } from './support/towerCanvas';

const TAKEN_OVER = 'La torre se abrió en otra ventana.';
// A change is saved 5 s after it happens; the stale save then answers 409.
const SAVE_AFTER_CHANGE_TIMEOUT_MS = 20_000;

test(
  'a second tab takes the tower over and the first one stops when it saves',
  { tag: DEBUG_TAG },
  async ({ page, context }) => {
    await openGame(page);

    const second = await context.newPage();
    await second.goto('/');
    await expect(second.locator('#app canvas')).toBeVisible({ timeout: GAME_LOAD_TIMEOUT_MS });
    await expect(second.getByRole('toolbar')).toBeVisible();

    const lobby = { type: 'buildLobby', level: 1, x0: CENTER_COLUMN - 5, x1: CENTER_COLUMN + 4 };
    expect(await sendCommand(page, { ...lobby, height: 1 })).toMatchObject({ ok: true });

    await expect(page.getByText(TAKEN_OVER)).toBeVisible({
      timeout: SAVE_AFTER_CHANGE_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: 'Jugar acá' })).toBeVisible();

    await expect(second.getByText(TAKEN_OVER)).toHaveCount(0);
    expect(await sendCommand(second, { ...lobby, height: 1 })).toMatchObject({ ok: true });
    const before = (await readTowerState(second)).step;
    await expect
      .poll(async () => (await readTowerState(second)).step, { timeout: 10_000 })
      .toBeGreaterThan(before);
    await expect(second.getByText(TAKEN_OVER)).toHaveCount(0);
  },
);
