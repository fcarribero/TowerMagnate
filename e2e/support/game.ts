import { expect, type Page } from '@playwright/test';
import { registerUser, type TestUser } from './users';

const GAME_LOAD_TIMEOUT_MS = 45_000;

/** Registers a fresh player, which leaves its session cookie in the page's browser context. */
export async function openGame(page: Page): Promise<TestUser> {
  const user = await registerUser(page.request);
  await page.goto('/');
  // A freshly started dev server compiles the page and the tower worker on first load.
  await expect(page.locator('#app canvas')).toBeVisible({ timeout: GAME_LOAD_TIMEOUT_MS });
  return user;
}

/** The dev hook the page's worker socket sets in debug builds. */
interface TowerMagnateHook {
  sendFrame(text: string): void;
  readState(): Promise<TowerState>;
  onServerMessage(callback: (message: { t: string; p: { id?: string } }) => void): () => void;
}

const REPLY_TIMEOUT_MS = 10_000;
let nextFrameId = 0;

/** Sends one frame to the tower worker and resolves with the commandResult that carries the same id. */
export async function sendFrame(
  page: Page,
  type: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  nextFrameId += 1;
  const id = `e2e-${nextFrameId}`;
  return page.evaluate(
    ({ frameType, body, frameId, timeoutMs }) =>
      new Promise((resolve, reject) => {
        const hook = (globalThis as unknown as { __towerMagnate?: TowerMagnateHook })
          .__towerMagnate;
        if (hook === undefined) {
          reject(new Error('The page has no __towerMagnate hook'));
          return;
        }
        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error('no command result'));
        }, timeoutMs);
        const unsubscribe = hook.onServerMessage((message) => {
          if (message.t === 'commandResult' && message.p.id === frameId) {
            clearTimeout(timer);
            unsubscribe();
            resolve(message.p);
          }
        });
        hook.sendFrame(JSON.stringify({ v: 1, t: frameType, p: { id: frameId, ...body } }));
      }),
    { frameType: type, body: payload, frameId: id, timeoutMs: REPLY_TIMEOUT_MS },
  );
}

/** Sends one build command and resolves with the server's answer. */
export async function sendCommand(page: Page, command: Record<string, unknown>): Promise<unknown> {
  return sendFrame(page, 'command', { command });
}

/** Runs the tower forward by simulation steps; needs a server with debug commands on. */
export async function fastForward(page: Page, steps: number): Promise<unknown> {
  return sendFrame(page, 'debug.fastForward', { steps });
}

export interface TowerState {
  step: number;
  money: number;
  stars: number;
  units: { type: string; x: number; level: number }[];
  shafts: { type: string; x: number; bottom: number; top: number }[];
}

/** The tower's current state, read from the worker. */
export async function readTowerState(page: Page): Promise<TowerState> {
  return page.evaluate(async () => {
    const hook = (globalThis as unknown as { __towerMagnate?: TowerMagnateHook }).__towerMagnate;
    if (hook === undefined) {
      throw new Error('The page has no __towerMagnate hook');
    }
    const { step, money, stars, units, shafts } = await hook.readState();
    return {
      step,
      money,
      stars,
      units: Object.values(units).map((u) => ({ type: u.type, x: u.x, level: u.level })),
      shafts: Object.values(shafts).map((s) => ({
        type: s.type,
        x: s.x,
        bottom: s.bottom,
        top: s.top,
      })),
    };
  });
}
