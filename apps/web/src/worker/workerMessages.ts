import type { TowerState } from '@tower-magnate/shared';
import type { UploadOutcome } from './stateUploader';

/** What the page posts to the tower Worker. */
export type PageToWorker =
  | { kind: 'start'; state: unknown; token: string; debug: boolean }
  /** A client frame, as the JSON text the WebSocket carried. */
  | { kind: 'client'; data: string }
  | { kind: 'saveNow' }
  /** Saves now and answers 'flushed' once the upload finished. Sent before logging out. */
  | { kind: 'flush' }
  /** Dev hook for e2e, answered with 'state'. */
  | { kind: 'readState' }
  | { kind: 'stop' };

/** What the tower Worker posts to the page. */
export type WorkerToPage =
  /** A server frame, as the JSON text the WebSocket carried. */
  | { kind: 'server'; data: string }
  | { kind: 'saveFailing'; failing: boolean }
  | { kind: 'takenOver' }
  /** A save got 401: the server no longer accepts the session. The Worker has stopped. */
  | { kind: 'sessionLost' }
  | { kind: 'flushed'; outcome: UploadOutcome }
  | { kind: 'outdated' }
  | { kind: 'state'; state: TowerState }
  | { kind: 'fatal'; message: string };
