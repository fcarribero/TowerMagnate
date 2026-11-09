import type { ClientMessage } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cameraViewport,
  createCamera,
  panCamera,
  resizeCamera,
  zoomCamera,
} from '../render/camera';
import { VIEWPORT_INTERVAL_MS, VIEWPORT_MARGIN_LEVELS, ViewportReporter } from './viewportReporter';

function fakeServer(open = true) {
  const sent: ClientMessage[] = [];
  const server = {
    open,
    sent,
    viewports: () => sent.filter((message) => message.t === 'viewport').map((message) => message.p),
  };
  const reporter = new ViewportReporter({
    send(message) {
      if (!server.open) {
        return false;
      }
      sent.push(message);
      return true;
    },
  });
  return { server, reporter };
}

/** Viewport sends in every one-second window, as the server counts them. */
function mostSendsInOneSecond(sendTimes: number[]): number {
  return Math.max(
    0,
    ...sendTimes.map(
      (start) => sendTimes.filter((time) => time >= start && time - start < 1000).length,
    ),
  );
}

describe('ViewportReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the camera range with a two level margin right after a snapshot', () => {
    const { server, reporter } = fakeServer();
    const camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    server.sent.length = 0;
    vi.advanceTimersByTime(5_000);

    reporter.snapshotReceived();
    expect(server.viewports()).toEqual([cameraViewport(camera, VIEWPORT_MARGIN_LEVELS)]);
    expect(VIEWPORT_MARGIN_LEVELS).toBe(2);
  });

  it('sends after every snapshot even when the range did not change', () => {
    const { server, reporter } = fakeServer();
    reporter.cameraChanged(createCamera(1200, 800, 2));
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    reporter.snapshotReceived();
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    reporter.snapshotReceived();
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    expect(server.viewports()).toHaveLength(3);
  });

  it('waits for the camera when the snapshot comes first', () => {
    const { server, reporter } = fakeServer();
    reporter.snapshotReceived();
    expect(server.viewports()).toHaveLength(0);
    const camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    expect(server.viewports()).toEqual([cameraViewport(camera, 2)]);
  });

  it('sends again after a snapshot on a socket that was closed when the camera moved', () => {
    const { server, reporter } = fakeServer(false);
    const camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    expect(server.sent).toHaveLength(0);
    server.open = true;
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    reporter.snapshotReceived();
    expect(server.viewports()).toEqual([cameraViewport(camera, 2)]);
  });

  it('sends a new range after pan, zoom and resize', () => {
    const { server, reporter } = fakeServer();
    let camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    const moves = [
      (c: typeof camera) => panCamera(c, 0, 400),
      (c: typeof camera) => zoomCamera(c, 1, 600, 400),
      (c: typeof camera) => resizeCamera(c, 1600, 1000),
    ];
    for (const move of moves) {
      vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
      camera = move(camera);
      reporter.cameraChanged(camera);
    }
    const sent = server.viewports();
    expect(sent).toHaveLength(4);
    expect(sent.at(-1)).toEqual(cameraViewport(camera, 2));
    expect(new Set(sent.map((range) => JSON.stringify(range))).size).toBe(4);
  });

  it('does not send when the range did not change', () => {
    const { server, reporter } = fakeServer();
    const camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    reporter.cameraChanged({ ...camera });
    reporter.cameraChanged({ ...camera });
    vi.advanceTimersByTime(5_000);
    expect(server.viewports()).toHaveLength(1);
  });

  it('turns a burst of 20 pans in one second into at most 4 sends plus the final range', () => {
    const { server, reporter } = fakeServer();
    const sendTimes: number[] = [];
    const startMs = Date.now();
    let camera = createCamera(1200, 800, 2);
    let sentBefore = 0;
    const noteSends = (): void => {
      while (sentBefore < server.sent.length) {
        sendTimes.push(Date.now() - startMs);
        sentBefore++;
      }
    };
    for (let pan = 0; pan < 20; pan++) {
      camera = panCamera(camera, 0, 64);
      reporter.cameraChanged(camera);
      noteSends();
      for (let ms = 0; ms < 50; ms++) {
        vi.advanceTimersByTime(1);
        noteSends();
      }
    }
    vi.advanceTimersByTime(VIEWPORT_INTERVAL_MS);
    noteSends();

    const sent = server.viewports();
    expect(sent.length).toBeLessThanOrEqual(5);
    expect(sendTimes.filter((time) => time < 1000).length).toBeLessThanOrEqual(4);
    expect(mostSendsInOneSecond(sendTimes)).toBeLessThanOrEqual(4);
    expect(sent.at(-1)).toEqual(cameraViewport(camera, 2));
  });

  it('stops a pending send', () => {
    const { server, reporter } = fakeServer();
    const camera = createCamera(1200, 800, 2);
    reporter.cameraChanged(camera);
    reporter.cameraChanged(panCamera(camera, 0, 400));
    reporter.stop();
    vi.advanceTimersByTime(5_000);
    expect(server.viewports()).toHaveLength(1);
  });
});
