import { PROTOCOL_VERSION, type ServerMessage } from '@tower-magnate/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PageToWorker, WorkerToPage } from '../worker/workerMessages';
import type { ConnectionStatus } from './gameSocket';
import { WorkerSocket, type WorkerLike, type WorkerSocketOptions } from './workerSocket';

class FakeWorker implements WorkerLike {
  posted: PageToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerToPage>) => void) | null = null;

  postMessage(message: PageToWorker): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerToPage): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerToPage>);
  }
}

class FakeVisibility {
  hidden = false;
  private listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of this.listeners) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function setup(overrides: Partial<WorkerSocketOptions> = {}) {
  const worker = new FakeWorker();
  const visibility = new FakeVisibility();
  const received: ServerMessage[] = [];
  const statuses: ConnectionStatus[] = [];
  const socket = new WorkerSocket({
    sink: { receive: (m) => received.push(m), reconnected: () => {} },
    play: { token: 'tok', state: { schemaVersion: 1 } },
    debug: false,
    createWorker: () => worker,
    visibility,
    onStatus: (s) => statuses.push(s),
    ...overrides,
  });
  return { worker, visibility, received, statuses, socket };
}

const PONG_FRAME = JSON.stringify({
  v: PROTOCOL_VERSION,
  t: 'pong',
  p: { clientTime: 1, serverTime: 2 },
});

describe('WorkerSocket', () => {
  it('connect posts start then hello', () => {
    const { worker, socket } = setup();
    socket.connect();
    expect(worker.posted[0]).toEqual({
      kind: 'start',
      state: { schemaVersion: 1 },
      token: 'tok',
      debug: false,
    });
    const hello = worker.posted[1];
    expect(hello?.kind).toBe('client');
    expect(hello?.kind === 'client' && JSON.parse(hello.data)).toEqual({
      v: PROTOCOL_VERSION,
      t: 'hello',
      p: { protocol: PROTOCOL_VERSION },
    });
    expect(socket.connectionStatus).toBe('connecting');
  });

  it('status turns live on the first server message and the sink receives it', () => {
    const { worker, socket, received, statuses } = setup();
    socket.connect();
    worker.emit({ kind: 'server', data: PONG_FRAME });
    expect(socket.connectionStatus).toBe('live');
    expect(statuses).toEqual(['connecting', 'live']);
    expect(received).toEqual([JSON.parse(PONG_FRAME)]);
  });

  it('takenOver closes and calls onTakenOver', () => {
    const onTakenOver = vi.fn();
    const { worker, socket } = setup({ onTakenOver });
    socket.connect();
    worker.emit({ kind: 'server', data: PONG_FRAME });
    worker.emit({ kind: 'takenOver' });
    expect(socket.connectionStatus).toBe('closed');
    expect(onTakenOver).toHaveBeenCalledOnce();
  });

  it('hiding the page posts saveNow', () => {
    const { worker, socket, visibility } = setup();
    socket.connect();
    visibility.setHidden(false);
    expect(worker.posted.some((m) => m.kind === 'saveNow')).toBe(false);
    visibility.setHidden(true);
    expect(worker.posted.at(-1)).toEqual({ kind: 'saveNow' });
  });

  it('stop terminates the worker', () => {
    const { worker, socket, visibility } = setup();
    socket.connect();
    socket.stop();
    expect(worker.posted.at(-1)).toEqual({ kind: 'stop' });
    expect(worker.terminated).toBe(true);
    expect(visibility.listenerCount).toBe(0);
    expect(socket.connectionStatus).toBe('closed');
  });
});
