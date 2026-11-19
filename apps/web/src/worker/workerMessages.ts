import type { TowerState } from '@tower-magnate/shared';

/** What the page posts to the tower Worker. */
export type PageToWorker =
  | { kind: 'start'; state: unknown; token: string; debug: boolean }
  /** A client frame, as the JSON text the WebSocket carried. */
  | { kind: 'client'; data: string }
  | { kind: 'saveNow' }
  /** Dev hook for e2e, answered with 'state'. */
  | { kind: 'readState' }
  | { kind: 'stop' };

/** What the tower Worker posts to the page. */
export type WorkerToPage =
  /** A server frame, as the JSON text the WebSocket carried. */
  | { kind: 'server'; data: string }
  | { kind: 'saveFailing'; failing: boolean }
  | { kind: 'takenOver' }
  | { kind: 'outdated' }
  | { kind: 'state'; state: TowerState }
  | { kind: 'fatal'; message: string };
