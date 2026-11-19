// @vitest-environment node
import { gunzipSync } from 'node:zlib';
import {
  createTower,
  deserializeState,
  SCHEMA_VERSION,
  serializeState,
  setStructure,
} from '@tower-magnate/engine';
import { clientMessage, PROTOCOL_VERSION } from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadOutcome } from './stateUploader';
import type { WorkerToPage } from './workerMessages';
import { createWorkerHost, TICK_ERROR_LIMIT } from './workerHost';

const HELLO = JSON.stringify(clientMessage('hello', { protocol: PROTOCOL_VERSION }));

function towerJson(): unknown {
  const state = createTower(1);
  setStructure(state.grid, 1, 10, 29, 'lobby');
  state.grid.mainLobbyHeight = 1;
  return JSON.parse(serializeState(state)) as unknown;
}

function serverFrames(posts: WorkerToPage[]): { t: string; p: Record<string, unknown> }[] {
  return posts.flatMap((m) =>
    m.kind === 'server' ? [JSON.parse(m.data) as { t: string; p: Record<string, unknown> }] : [],
  );
}

describe('worker host', () => {
  let posts: WorkerToPage[];
  let upload: ReturnType<typeof vi.fn<(body: Uint8Array, token: string) => Promise<UploadOutcome>>>;
  let host: ReturnType<typeof createWorkerHost>;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(1_000_000);
    posts = [];
    upload = vi.fn<(body: Uint8Array, token: string) => Promise<UploadOutcome>>(
      async () => 'saved',
    );
    host = createWorkerHost((m) => posts.push(m), { upload, now: Date.now });
  });

  afterEach(async () => {
    await host.handle({ kind: 'stop' });
    vi.useRealTimers();
  });

  it('a state with a newer schemaVersion reports outdated and does not start', async () => {
    const state = { ...(towerJson() as object), schemaVersion: SCHEMA_VERSION + 1 };
    await host.handle({ kind: 'start', state, token: 'tok', debug: false });
    await host.handle({ kind: 'client', data: HELLO });
    expect(posts).toEqual([{ kind: 'outdated' }]);
  });

  it('start then hello posts a snapshot', async () => {
    const started = host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await host.handle({ kind: 'client', data: HELLO });
    await started;
    expect(serverFrames(posts).filter((m) => m.t === 'snapshot')).toHaveLength(1);
  });

  it('a 409 upload posts takenOver and stops the session', async () => {
    upload.mockResolvedValue('stale');
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await host.handle({ kind: 'client', data: HELLO });
    await host.handle({ kind: 'saveNow' });
    await vi.waitFor(() => expect(posts).toContainEqual({ kind: 'takenOver' }));
    posts.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posts.filter((m) => m.kind === 'server')).toEqual([]);
  });

  it('flush answers flushed with the outcome after the upload finished', async () => {
    let release!: (o: UploadOutcome) => void;
    upload.mockImplementation(() => new Promise<UploadOutcome>((r) => (release = r)));
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    const flushing = host.handle({ kind: 'flush' });
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(posts.some((m) => m.kind === 'flushed')).toBe(false);
    release('saved');
    await flushing;
    expect(posts).toContainEqual({ kind: 'flushed', outcome: 'saved' });
  });

  it('flush before start answers failed', async () => {
    await host.handle({ kind: 'flush' });
    expect(posts).toEqual([{ kind: 'flushed', outcome: 'failed' }]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('a 401 upload posts sessionLost and stops the session', async () => {
    upload.mockResolvedValue('unauthenticated');
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await host.handle({ kind: 'client', data: HELLO });
    await host.handle({ kind: 'saveNow' });
    await vi.waitFor(() => expect(posts).toContainEqual({ kind: 'sessionLost' }));
    posts.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posts.filter((m) => m.kind === 'server')).toEqual([]);
    expect(upload).toHaveBeenCalledOnce();
  });

  it('logs tick errors and posts fatal after five of them', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    host = createWorkerHost((m) => posts.push(m), {
      upload,
      now: Date.now,
      advance: () => {
        throw new Error('engine broke');
      },
    });
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(logged).toHaveBeenCalled();
    expect(posts.filter((m) => m.kind === 'fatal')).toHaveLength(1);
    expect(logged.mock.calls.length).toBe(TICK_ERROR_LIMIT);
  });

  it('a lone tick error is logged and does not stop the tower', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failures = 1;
    host = createWorkerHost((m) => posts.push(m), {
      upload,
      now: Date.now,
      advance: (state, steps) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('engine hiccup');
        }
        return { state: { ...state, step: state.step + steps }, events: [] };
      },
    });
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(posts.some((m) => m.kind === 'fatal')).toBe(false);
  });

  it('saveNow uploads gzipped state that deserializes to the current step', async () => {
    await host.handle({ kind: 'start', state: towerJson(), token: 'tok', debug: false });
    await host.handle({ kind: 'client', data: HELLO });
    const snapshot = serverFrames(posts).find((m) => m.t === 'snapshot');
    await host.handle({ kind: 'saveNow' });
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    const [body, token] = upload.mock.calls[0] ?? [];
    expect(token).toBe('tok');
    const saved = deserializeState(gunzipSync(body as Uint8Array).toString('utf8'));
    expect(saved.step).toBe(snapshot?.p.step);
  });
});
