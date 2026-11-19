import { migrateState, SCHEMA_VERSION, serializeState } from '@tower-magnate/engine';
import { LocalSession, type AdvanceTower } from '@tower-magnate/host';
import { gzipText } from './saveCodec';
import { SaveScheduler } from './saveScheduler';
import { uploadState } from './stateUploader';
import type { PageToWorker, WorkerToPage } from './workerMessages';

export interface WorkerHostDeps {
  upload?: typeof uploadState;
  now?: () => number;
  /** Tests stand in for the engine's advance. */
  advance?: AdvanceTower;
}

/** This many tick errors within TICK_ERROR_WINDOW_MS stop the tower with a fatal. */
export const TICK_ERROR_LIMIT = 5;
export const TICK_ERROR_WINDOW_MS = 2_000;

export interface WorkerHost {
  handle(message: PageToWorker): Promise<void>;
}

function isNewerSchema(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const version = (state as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && version > SCHEMA_VERSION;
}

/** The tower Worker without the Worker: one local session plus its saves. */
export function createWorkerHost(
  post: (message: WorkerToPage) => void,
  deps: WorkerHostDeps = {},
): WorkerHost {
  const upload = deps.upload ?? uploadState;
  const now = deps.now ?? Date.now;
  let recentErrors: number[] = [];
  let session: LocalSession | null = null;
  let scheduler: SaveScheduler | null = null;
  let stopped = false;

  async function start(message: Extract<PageToWorker, { kind: 'start' }>): Promise<void> {
    if (session !== null || stopped) return;
    if (isNewerSchema(message.state)) {
      post({ kind: 'outdated' });
      return;
    }
    const state = migrateState(message.state);
    // Assigned before the first await, so client frames that follow find the session and wait in it.
    const current = new LocalSession({
      state,
      debug: message.debug,
      send: (data) => post({ kind: 'server', data }),
      onChange: () => scheduler?.changed(),
      onError: (error) => tickFailed(error),
      now: deps.now,
      advance: deps.advance,
    });
    session = current;
    scheduler = new SaveScheduler({
      save: async () => {
        const body = await gzipText(serializeState(await current.savedState()));
        return upload(body, message.token);
      },
      onFailingChange: (failing) => post({ kind: 'saveFailing', failing }),
      onStale: () => {
        current.stop();
        post({ kind: 'takenOver' });
      },
      onUnauthenticated: () => {
        current.stop();
        post({ kind: 'sessionLost' });
      },
      now: deps.now,
    });
    await current.start();
    if (!stopped) scheduler.start();
  }

  /** Logs the error. Enough of them close together mean the tower cannot run: it stops with a fatal. */
  function tickFailed(error: unknown): void {
    if (stopped) return;
    console.error('A tower tick failed:', error);
    const t = now();
    recentErrors = [...recentErrors.filter((at) => t - at < TICK_ERROR_WINDOW_MS), t];
    if (recentErrors.length >= TICK_ERROR_LIMIT) {
      stop();
      post({
        kind: 'fatal',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function flush(): Promise<void> {
    const outcome = scheduler === null ? 'failed' : await scheduler.flush();
    post({ kind: 'flushed', outcome });
  }

  function stop(): void {
    stopped = true;
    scheduler?.stop();
    session?.stop();
  }

  return {
    async handle(message) {
      try {
        switch (message.kind) {
          case 'start':
            await start(message);
            break;
          case 'client':
            await session?.receive(message.data);
            break;
          case 'saveNow':
            scheduler?.saveNow();
            break;
          case 'flush':
            await flush();
            break;
          case 'readState':
            if (session !== null) post({ kind: 'state', state: await session.savedState() });
            break;
          case 'stop':
            stop();
            break;
        }
      } catch (error) {
        post({ kind: 'fatal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
