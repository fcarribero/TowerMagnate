import {
  clientMessage,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ClientMessage,
  type PlayResponse,
  type ServerMessage,
  type TowerState,
} from '@tower-magnate/shared';
import type { PageToWorker, WorkerToPage } from '../worker/workerMessages';
import type { ConnectionStatus, MessageSink } from './gameSocket';
import type { TowerLink } from './towerLink';

/** The part of the browser Worker the socket uses, so tests can stand in for it. */
export interface WorkerLike {
  postMessage(message: PageToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerToPage>) => void) | null;
}

export interface PageVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface WorkerSocketOptions {
  sink: MessageSink;
  play: PlayResponse;
  /** Debug and developer messages are answered only when true. */
  debug: boolean;
  createWorker?: () => WorkerLike;
  /** Check every server message against the schema. Meant for development builds. */
  validate?: boolean;
  onStatus?: (status: ConnectionStatus) => void;
  /** Another tab opened the tower; this one stopped. */
  onTakenOver?: () => void;
  /** The saved state is newer than this build's engine. */
  onOutdated?: () => void;
  onSaveFailing?: (failing: boolean) => void;
  /** The Worker stopped on an error. */
  onFatal?: (message: string) => void;
  visibility?: PageVisibility;
}

/** What `globalThis.__towerMagnate` holds in debug builds, for e2e tests. */
export interface TowerMagnateHook {
  sendFrame(text: string): void;
  readState(): Promise<TowerState>;
}

type HookGlobal = typeof globalThis & { __towerMagnate?: TowerMagnateHook };

function createTowerWorker(): WorkerLike {
  return new Worker(new URL('../worker/towerWorker.ts', import.meta.url), {
    type: 'module',
  }) as WorkerLike;
}

/**
 * The tower running in a Web Worker, behind the same surface as `GameSocket`.
 * Frames cross as the JSON text the WebSocket carried. No ping and no retry:
 * the Worker does not drop out the way a network does.
 */
export class WorkerSocket implements TowerLink {
  private worker: WorkerLike | null = null;
  private status: ConnectionStatus = 'closed';
  private visibility: PageVisibility | null = null;
  private stateWaiters: ((state: TowerState) => void)[] = [];

  constructor(private readonly options: WorkerSocketOptions) {}

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (this.worker !== null) return;
    const worker = (this.options.createWorker ?? createTowerWorker)();
    worker.onmessage = (event) => this.handle(event.data);
    this.worker = worker;
    this.setStatus('connecting');
    const { play, debug } = this.options;
    this.post({ kind: 'start', state: play.state, token: play.token, debug });
    this.sayHello();
    this.visibility = this.options.visibility ?? document;
    this.visibility.addEventListener('visibilitychange', this.onVisibilityChange);
    if (debug) {
      (globalThis as HookGlobal).__towerMagnate = {
        sendFrame: (text) => this.post({ kind: 'client', data: text }),
        readState: () => this.readState(),
      };
    }
  }

  stop(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker !== null) {
      worker.postMessage({ kind: 'stop' });
      worker.onmessage = null;
      worker.terminate();
    }
    this.visibility?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.visibility = null;
    this.stateWaiters = [];
    if (this.options.debug) {
      delete (globalThis as HookGlobal).__towerMagnate;
    }
    this.setStatus('closed');
  }

  resync(): void {
    this.sayHello();
  }

  send(message: ClientMessage): boolean {
    return this.sendText(JSON.stringify(message));
  }

  sendDebug(type: string, payload: Record<string, unknown>): boolean {
    return this.sendText(JSON.stringify({ v: PROTOCOL_VERSION, t: `debug.${type}`, p: payload }));
  }

  /** The state the Worker would save now. */
  readState(): Promise<TowerState> {
    return new Promise((resolve) => {
      this.stateWaiters.push(resolve);
      this.post({ kind: 'readState' });
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (this.visibility?.hidden) {
      this.post({ kind: 'saveNow' });
    }
  };

  private sendText(data: string): boolean {
    if (this.worker === null || this.status === 'closed') return false;
    this.post({ kind: 'client', data });
    return true;
  }

  private sayHello(): void {
    this.send(clientMessage('hello', { protocol: PROTOCOL_VERSION }));
  }

  private post(message: PageToWorker): void {
    this.worker?.postMessage(message);
  }

  private handle(message: WorkerToPage): void {
    switch (message.kind) {
      case 'server': {
        const parsed = this.parse(message.data);
        if (parsed === null) return;
        if (this.status === 'connecting') this.setStatus('live');
        this.options.sink.receive(parsed);
        return;
      }
      case 'saveFailing':
        this.options.onSaveFailing?.(message.failing);
        return;
      case 'takenOver':
        this.setStatus('closed');
        this.options.onTakenOver?.();
        return;
      case 'outdated':
        this.setStatus('closed');
        this.options.onOutdated?.();
        return;
      case 'state': {
        const waiters = this.stateWaiters;
        this.stateWaiters = [];
        for (const resolve of waiters) resolve(message.state);
        return;
      }
      case 'fatal':
        console.error('The tower worker stopped:', message.message);
        this.setStatus('closed');
        this.options.onFatal?.(message.message);
        return;
    }
  }

  private parse(data: string): ServerMessage | null {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.warn('Dropped a server message that is not JSON');
      return null;
    }
    if (!this.options.validate) {
      return json as ServerMessage;
    }
    const result = ServerMessageSchema.safeParse(json);
    if (!result.success) {
      console.warn('Dropped a server message that does not match the protocol', result.error);
      return null;
    }
    return result.data;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }
}
