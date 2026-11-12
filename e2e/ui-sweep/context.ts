import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { sendFrame } from '../support/game';
import { registerUser } from '../support/users';
import { fileNameFor, SweepError, type FontMode, type UiScale } from './plan';

const CANVAS_TIMEOUT_MS = 30_000;
const TILE_PIXELS_AT_ZOOM_1 = 8;
const WORLD_COLUMNS = 375;
const SCROLL_PRESSES_TO_EDGE = 80;
const PAN_SETTLE_MS = 500;
const SETTLE_MS = 400;
/** Long enough for the offices to be leased and for money to have moved. */
const STEPS_PER_DAY = 8_640;

export interface PersonSpot {
  x: number;
  level: number;
}

export interface SweepContext {
  scale: UiScale;
  fonts: FontMode;
  browserContext: BrowserContext;
  page: Page;
  /** Saves the page, or one element of it, as the file of this screen. */
  shot(screen: string, target?: Locator): Promise<void>;
  /** Sends a debug socket message of the logged in player's session. */
  debug(type: string, payload?: Record<string, unknown>): Promise<void>;
  /** Registers a player, loads the game with the vertical slice tower at a fixed time and Monday. */
  startGame(): Promise<void>;
  /** Zooms out, scrolls to the left edge of the world and returns the page x of a tile column. */
  columnX(column: number): Promise<number>;
  levelY(level: string): Promise<number>;
  /** Page x of a fractional tile column. */
  pixelX(column: number): Promise<number>;
  /** Where a walking person is now, among the tower's lowest floors. */
  findPersonSpot(): Promise<PersonSpot>;
  clickTile(column: number, level: string): Promise<void>;
  openWindowButton(name: string): Promise<void>;
  closeWindows(): Promise<void>;
  /** A second page of the same session, for states that need their own load. */
  extraPage(): Promise<Page>;
}

export function createSweepContext(options: {
  browserContext: BrowserContext;
  page: Page;
  scale: UiScale;
  fonts: FontMode;
  outDir: string;
}): SweepContext {
  const { browserContext, page, scale, fonts, outDir } = options;
  mkdirSync(outDir, { recursive: true });
  const main = page;

  const context: SweepContext = {
    scale,
    fonts,
    browserContext,
    get page() {
      return main;
    },
    async shot(screen, target) {
      await main.waitForTimeout(SETTLE_MS);
      const path = join(outDir, fileNameFor(screen, scale, fonts));
      if (target) await target.screenshot({ path });
      else await main.screenshot({ path });
    },
    async debug(type, payload = {}) {
      const answer = (await sendFrame(main, type, payload)) as { ok?: boolean; error?: string };
      if (answer.ok === false) throw new Error(`${type} was refused: ${JSON.stringify(answer)}`);
    },
    async startGame() {
      await registerUser(main.request);
      await main.goto('/');
      await main.locator('#app canvas').waitFor({ state: 'visible', timeout: CANVAS_TIMEOUT_MS });
      await context.debug('debug.loadScenario', { name: 'verticalSlice' });
      await context.debug('debug.fastForward', { steps: STEPS_PER_DAY });
      await context.debug('debug.setClock', { day: 0, time: '09:00' });
      await context.debug('debug.setMoney', { amount: 2_000_000 });
    },
    async pixelX(column) {
      const box = await main.locator('#app canvas').boundingBox();
      if (box === null) throw new Error('The game canvas has no box');
      const centering = Math.max(0, (box.width - WORLD_COLUMNS * TILE_PIXELS_AT_ZOOM_1) / 2);
      return box.x + centering + column * TILE_PIXELS_AT_ZOOM_1;
    },
    async columnX(column) {
      return (await context.pixelX(column)) + TILE_PIXELS_AT_ZOOM_1 / 2;
    },
    findPersonSpot: () => readPersonSpot(main),
    async levelY(level) {
      const tag = main.locator('.level-ruler-mark', {
        has: main.locator('.level-ruler-tag', { hasText: new RegExp(`^${level}$`) }),
      });
      const box = await tag.first().boundingBox();
      if (box === null) throw new Error(`The ruler has no mark for level ${level}`);
      return box.y + box.height / 2;
    },
    async clickTile(column, level) {
      await main.mouse.click(await context.columnX(column), await context.levelY(level));
    },
    async openWindowButton(name) {
      await main.getByRole('button', { name, exact: true }).click();
    },
    async closeWindows() {
      for (const button of await main.getByRole('button', { name: 'Cerrar', exact: true }).all()) {
        await button.click().catch(() => undefined);
      }
    },
    extraPage: () => browserContext.newPage(),
  };
  return context;
}

/** Puts the camera at zoom 1 against the left edge, where a tile column has a known page x. */
export async function frameTowerLeft(page: Page): Promise<void> {
  await page.keyboard.press('-');
  for (let press = 0; press < SCROLL_PRESSES_TO_EDGE; press++) await page.keyboard.press('a');
  await page.waitForTimeout(PAN_SETTLE_MS);
}

export async function runScreen(screen: string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    if (error instanceof SweepError) throw error;
    throw new SweepError(
      screen,
      error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
    );
  }
}

const PERSON_MODE_WALKING = 0;
const PERSON_SPOT_TIMEOUT_MS = 8_000;

/**
 * Asks the server, on a second socket that reports a viewport over the tower, for the people it
 * sends, and returns one standing in a floor that is not the lobby and not riding a car.
 */
async function readPersonSpot(page: Page): Promise<PersonSpot> {
  const spot = await page.evaluate(
    ({ walking, timeoutMs }) =>
      new Promise<PersonSpot | null>((resolve) => {
        const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${scheme}//${location.host}/ws`);
        const timer = setTimeout(() => resolve(null), timeoutMs);
        let reported = false;
        socket.onopen = () => socket.send(JSON.stringify({ v: 1, t: 'hello', p: { protocol: 1 } }));
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (!reported) {
            reported = true;
            const viewport = { levelFrom: 1, levelTo: 10, xFrom: 100, xTo: 210 };
            socket.send(JSON.stringify({ v: 1, t: 'viewport', p: viewport }));
          }
          const packed: number[][] = message.p?.people ?? [];
          // packed person: id, kind, x, level, facing, mode, stress, shaft, car
          const found = packed.find(
            (person) => person[5] === walking && person[7] === 0 && (person[3] as number) >= 2,
          );
          if (found) {
            clearTimeout(timer);
            socket.close();
            resolve({ x: found[2] as number, level: found[3] as number });
          }
        };
      }),
    { walking: PERSON_MODE_WALKING, timeoutMs: PERSON_SPOT_TIMEOUT_MS },
  );
  if (spot === null) throw new Error('the server sent no walking person');
  return spot;
}
