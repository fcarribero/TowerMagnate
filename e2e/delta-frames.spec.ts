import { expect, test } from '@playwright/test';
import { openGame } from './support/game';

const FRAME_BUDGET_BYTES = 50_000;

test('delta frames from the server stay packed and under 50 KB', async ({ page }) => {
  const frames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => frames.push(String(payload)));
  });

  await openGame(page);
  await expect
    .poll(() => frames.filter((frame) => frame.includes('"t":"delta"')).length)
    .toBeGreaterThan(2);

  const deltas = frames
    .map((frame) => JSON.parse(frame))
    .filter((message) => message.t === 'delta');
  for (const delta of deltas) {
    expect(Array.isArray(delta.p.people)).toBe(true);
    expect(Array.isArray(delta.p.cars)).toBe(true);
    expect(delta.p.people.every((person: unknown) => Array.isArray(person))).toBe(true);
  }
  expect(Math.max(...frames.map((frame) => Buffer.byteLength(frame)))).toBeLessThan(
    FRAME_BUDGET_BYTES,
  );
  await expect(page.locator('#app canvas')).toBeVisible();
});
