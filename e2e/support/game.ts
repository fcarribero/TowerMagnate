import { expect, type Page } from '@playwright/test';
import { registerUser, type TestUser } from './users';

/** Registers a fresh player, which leaves its session cookie in the page's browser context. */
export async function openGame(page: Page): Promise<TestUser> {
  const user = await registerUser(page.request);
  await page.goto('/');
  await expect(page.locator('#app canvas')).toBeVisible();
  return user;
}

/** Sends one frame over a second socket of the page's session and resolves with the server's commandResult. */
async function sendFrame(
  page: Page,
  type: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return page.evaluate(
    ({ frameType, body }) =>
      new Promise((resolve, reject) => {
        const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${scheme}//${location.host}/ws`);
        const id = 'e2e-command';
        const timer = setTimeout(() => reject(new Error('no command result')), 10_000);
        socket.onopen = () => socket.send(JSON.stringify({ v: 1, t: 'hello', p: { protocol: 1 } }));
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.t === 'welcome' || message.t === 'snapshot') {
            socket.send(JSON.stringify({ v: 1, t: frameType, p: { id, ...body } }));
          } else if (message.t === 'commandResult' && message.p.id === id) {
            clearTimeout(timer);
            socket.close();
            resolve(message.p);
          }
        };
      }),
    { frameType: type, body: payload },
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
