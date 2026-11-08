import { expect, test, type Page } from '@playwright/test';
import {
  fastForward,
  openGame,
  readTowerState,
  sendCommand,
  type TowerState,
} from './support/game';
import { CENTER_COLUMN } from './support/towerCanvas';
import { restartServer, waitForHealthy, type RestartMode } from './support/stack';
import { resolveE2eTarget } from './support/target';

const target = resolveE2eTarget(process.env);

const AUTOSAVE_WAIT_MS = 32_000;
const SAMPLE_EVERY_MS = 2_000;
const RESTART_TIMEOUT_MS = 5 * 60_000;
const STEPS_PER_GAME_DAY = 8_640;
const STEPS_IN_30_SECONDS = 300;
const LOBBY_FIRST = CENTER_COLUMN - 16;
const LOBBY_LAST = CENTER_COLUMN + 15;

async function buildSmallTower(page: Page): Promise<void> {
  const commands = [
    { type: 'buildLobby', level: 1, x0: LOBBY_FIRST, x1: LOBBY_LAST, height: 1 },
    { type: 'buildFloor', level: 2, x0: LOBBY_FIRST, x1: LOBBY_LAST },
    { type: 'buildUnit', unitType: 'office', x: LOBBY_FIRST, level: 2 },
    { type: 'buildTransport', transportType: 'stairs', x: CENTER_COLUMN - 6, level: 1 },
    { type: 'buildShaft', shaftType: 'standard', x: CENTER_COLUMN + 6, bottom: 1, top: 2 },
  ];
  for (const command of commands) {
    expect(await sendCommand(page, command)).toMatchObject({ ok: true });
  }
}

/** Samples the tower until an autosave has surely happened, so the saved state is among the samples. */
async function sampleWhileAutosaving(page: Page): Promise<TowerState[]> {
  const samples: TowerState[] = [];
  const deadline = Date.now() + AUTOSAVE_WAIT_MS;
  while (Date.now() < deadline) {
    samples.push(await readTowerState(page));
    await page.waitForTimeout(SAMPLE_EVERY_MS);
  }
  samples.push(await readTowerState(page));
  return samples;
}

async function restartAndReload(page: Page, mode: RestartMode): Promise<void> {
  await restartServer(target.composeEnv, mode);
  await waitForHealthy(target.baseUrl, RESTART_TIMEOUT_MS);
  await page.reload();
  await expect(page.locator('#app canvas')).toBeVisible();
}

function moneyAtStep(samples: TowerState[], step: number): number[] {
  const before = samples.filter((sample) => sample.step <= step).at(-1);
  const after = samples.find((sample) => sample.step >= step);
  return [before, after].flatMap((sample) => (sample === undefined ? [] : [sample.money]));
}

for (const mode of ['graceful', 'hard'] as const) {
  test(`the tower survives a ${mode} server restart`, async ({ page }) => {
    test.skip(!target.startsStack, 'needs the compose stack the tests start themselves');
    test.setTimeout(RESTART_TIMEOUT_MS + 3 * 60_000);

    await openGame(page);
    await buildSmallTower(page);
    expect(await fastForward(page, STEPS_PER_GAME_DAY)).toMatchObject({ ok: true });

    const samples = await sampleWhileAutosaving(page);
    const lastSeen = samples.at(-1) as TowerState;
    expect(lastSeen.units.length).toBeGreaterThan(0);
    expect(lastSeen.shafts).toHaveLength(1);

    await restartAndReload(page, mode);
    const restored = await readTowerState(page);

    expect(restored.units).toEqual(lastSeen.units);
    expect(restored.shafts).toEqual(lastSeen.shafts);
    expect(restored.stars).toBe(lastSeen.stars);
    expect(restored.step).toBeGreaterThanOrEqual(lastSeen.step - STEPS_IN_30_SECONDS);
    expect(moneyAtStep(samples, restored.step)).toContain(restored.money);
  });
}
