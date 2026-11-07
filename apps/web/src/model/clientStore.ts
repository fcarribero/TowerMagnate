import type { Delta, ServerMessage, Snapshot } from '@tower-magnate/shared';
import { applyDelta, stateFromSnapshot, type GameState } from './gameState';

/** The two latest states, so the renderer can draw between them. */
export interface StoreFrames {
  readonly previous: GameState | null;
  readonly latest: GameState;
  /** Clock time when `latest` arrived, in the units of the store's `now`. */
  readonly latestArrivedAtMs: number;
}

type Listener = (frames: StoreFrames) => void;

export type ResyncReason = 'staleDelta' | 'reconnect';

export interface ClientStoreOptions {
  /** Called when the store needs a new snapshot. The socket layer answers with a fresh hello. */
  requestResync: (reason: ResyncReason) => void;
  /** Clock used to stamp arrivals. Defaults to `performance.now`. */
  now?: () => number;
}

/**
 * Client copy of the tower, fed by the socket. A delta older than the last
 * applied step, or any reconnect, asks for a new snapshot; deltas are ignored
 * until it arrives and the last state stays on screen meanwhile.
 */
export class ClientStore {
  private frames: StoreFrames | null = null;
  private waitingForSnapshot = true;
  private readonly listeners = new Set<Listener>();

  private readonly now: () => number;

  constructor(private readonly options: ClientStoreOptions) {
    this.now = options.now ?? (() => performance.now());
  }

  get current(): StoreFrames | null {
    return this.frames;
  }

  receive(message: ServerMessage): void {
    if (message.t === 'snapshot') {
      this.applySnapshot(message.p);
    } else if (message.t === 'delta') {
      this.applyDelta(message.p);
    }
  }

  applySnapshot(snapshot: Snapshot): void {
    this.waitingForSnapshot = false;
    this.frames = {
      previous: null,
      latest: stateFromSnapshot(snapshot),
      latestArrivedAtMs: this.now(),
    };
    this.notify();
  }

  applyDelta(delta: Delta): void {
    if (this.waitingForSnapshot || this.frames === null) {
      return;
    }
    const { latest } = this.frames;
    if (delta.step < latest.step) {
      this.resync('staleDelta');
      return;
    }
    this.frames = {
      previous: latest,
      latest: applyDelta(latest, delta),
      latestArrivedAtMs: this.now(),
    };
    this.notify();
  }

  /** The socket reconnected: whatever arrived before may be missing steps. */
  reconnected(): void {
    this.resync('reconnect');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with the selected value whenever it changes. Selectors
   * should return parts of the state, or plain objects of them, so the shallow
   * comparison can tell when nothing changed.
   */
  select<T>(selector: (state: GameState) => T, listener: (value: T) => void): () => void {
    let last: { value: T } | null = null;
    const check = (frames: StoreFrames): void => {
      const value = selector(frames.latest);
      if (last !== null && shallowEqual(last.value, value)) {
        return;
      }
      last = { value };
      listener(value);
    };
    if (this.frames !== null) {
      check(this.frames);
    }
    return this.subscribe(check);
  }

  private resync(reason: ResyncReason): void {
    this.waitingForSnapshot = true;
    this.options.requestResync(reason);
  }

  private notify(): void {
    if (this.frames === null) {
      return;
    }
    for (const listener of this.listeners) {
      listener(this.frames);
    }
  }
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every((key) => Object.is(a[key], b[key]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
