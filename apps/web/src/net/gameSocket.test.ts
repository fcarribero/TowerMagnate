import {
  PROTOCOL_VERSION,
  serverMessage,
  TOWER_SOCKET_PATH,
  type ClientMessage,
} from '@tower-magnate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { delta, snapshot, walker } from '../testing/protocolFixtures';
import { createGameConnection } from './gameConnection';
import {
  CLOSE_NOT_AUTHENTICATED,
  CLOSE_PROTOCOL_MISMATCH,
  GameSocket,
  gameSocketUrl,
  RETRY_DELAY_MS,
  SILENCE_LIMIT_MS,
  type MessageSink,
  type SocketLike,
} from './gameSocket';

class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sent: ClientMessage[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  serverOpens(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  serverSends(message: unknown): void {
    this.receiveRaw(JSON.stringify(message));
  }

  receiveRaw(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  serverCloses(code = 1006): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }

  sentTypes(): string[] {
    return this.sent.map((message) => message.t);
  }
}

function fakeSockets() {
  const sockets: FakeSocket[] = [];
  const createSocket = (): FakeSocket => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (socket === undefined) {
      throw new Error('No socket was opened');
    }
    return socket;
  };
  return { sockets, createSocket, last };
}

function setup(options: { validate?: boolean } = {}) {
  const { sockets, createSocket, last } = fakeSockets();
  const sink: MessageSink = { receive: vi.fn(), reconnected: vi.fn() };
  const onStatus = vi.fn();
  const onClosedForGood = vi.fn();
  const socket = new GameSocket({
    url: 'ws://test/ws',
    sink,
    createSocket,
    onStatus,
    onClosedForGood,
    ...options,
  });
  return { socket, sink, sockets, last, onStatus, onClosedForGood };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GameSocket', () => {
  it('says hello with the protocol version once the socket opens', () => {
    const { socket, last } = setup();
    socket.connect();
    expect(last().sent).toEqual([]);
    last().serverOpens();
    expect(last().sent).toEqual([
      { v: PROTOCOL_VERSION, t: 'hello', p: { protocol: PROTOCOL_VERSION } },
    ]);
    expect(socket.connectionStatus).toBe('live');
  });

  it('hands server messages to the sink', () => {
    const { socket, sink, last } = setup();
    socket.connect();
    last().serverOpens();
    last().serverSends(serverMessage('snapshot', snapshot));
    expect(sink.receive).toHaveBeenCalledWith(serverMessage('snapshot', snapshot));
  });

  it('drops messages that are not JSON, and in validating mode those off the protocol', () => {
    const { socket, sink, last } = setup({ validate: true });
    socket.connect();
    last().serverOpens();
    last().receiveRaw('not json');
    last().serverSends({ v: 1, t: 'delta', p: { step: 'soon' } });
    expect(sink.receive).not.toHaveBeenCalled();
    last().serverSends(serverMessage('delta', delta()));
    expect(sink.receive).toHaveBeenCalledTimes(1);
  });

  it('retries every 2 seconds and tells the sink once it is back', () => {
    const { socket, sink, sockets, last } = setup();
    socket.connect();
    last().serverOpens();
    last().serverCloses();
    expect(socket.connectionStatus).toBe('retrying');

    vi.advanceTimersByTime(RETRY_DELAY_MS - 1);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    last().serverCloses();
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(sockets).toHaveLength(3);

    last().serverOpens();
    expect(sink.reconnected).toHaveBeenCalledTimes(1);
    expect(socket.connectionStatus).toBe('live');
  });

  it('keeps the same delay however many attempts fail', () => {
    const { socket, sockets, last } = setup();
    socket.connect();
    for (let attempt = 0; attempt < 10; attempt++) {
      last().serverCloses();
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    }
    expect(sockets).toHaveLength(11);
  });

  it.each([CLOSE_NOT_AUTHENTICATED, CLOSE_PROTOCOL_MISMATCH])(
    'gives up when the server closes with %i',
    (code) => {
      const { socket, sockets, last, onClosedForGood } = setup();
      socket.connect();
      last().serverOpens();
      last().serverCloses(code);
      vi.advanceTimersByTime(RETRY_DELAY_MS * 2);
      expect(sockets).toHaveLength(1);
      expect(onClosedForGood).toHaveBeenCalledWith(code);
      expect(socket.connectionStatus).toBe('closed');
    },
  );

  it('pings while open and drops a connection that went silent', () => {
    const { socket, sockets, last } = setup();
    socket.connect();
    last().serverOpens();
    const first = last();
    vi.advanceTimersByTime(SILENCE_LIMIT_MS);
    expect(first.sentTypes()).toContain('ping');
    expect(first.closed).toBe(false);

    vi.advanceTimersByTime(SILENCE_LIMIT_MS);
    expect(first.closed).toBe(true);
    expect(socket.connectionStatus).toBe('retrying');
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(sockets).toHaveLength(2);
  });

  it('keeps a connection that keeps talking', () => {
    const { socket, last } = setup();
    socket.connect();
    last().serverOpens();
    for (let second = 0; second < 20; second++) {
      vi.advanceTimersByTime(1_000);
      last().serverSends(serverMessage('pong', { clientTime: 0, serverStep: second }));
    }
    expect(last().closed).toBe(false);
  });

  it('stops for good when asked, ignoring the late close event', () => {
    const { socket, sockets, last } = setup();
    socket.connect();
    last().serverOpens();
    socket.stop();
    last().serverCloses();
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(sockets).toHaveLength(1);
    expect(socket.connectionStatus).toBe('closed');
  });

  it('does not send while the socket is not open', () => {
    const { socket, last } = setup();
    socket.connect();
    expect(socket.send({ v: PROTOCOL_VERSION, t: 'ping', p: { clientTime: 0 } })).toBe(false);
    expect(last().sent).toEqual([]);
  });
});

describe('createGameConnection', () => {
  function connected() {
    const { createSocket, last, sockets } = fakeSockets();
    const connection = createGameConnection({ url: 'ws://test/ws', createSocket });
    connection.socket.connect();
    last().serverOpens();
    last().serverSends(serverMessage('snapshot', snapshot));
    return { ...connection, last, sockets };
  }

  it('says hello again on the same socket when a stale delta arrives', () => {
    const { store, last } = connected();
    last().serverSends(serverMessage('delta', delta({ step: 105 })));
    last().serverSends(serverMessage('delta', delta({ step: 104 })));
    expect(last().sentTypes()).toEqual(['hello', 'hello']);
    expect(store.current?.latest.step).toBe(105);
  });

  it('after a dropped network, resyncs and shows only what the new snapshot has', () => {
    const { store, last, sockets } = connected();
    last().serverSends(serverMessage('delta', delta({ step: 101 })));
    expect(store.current?.latest.people.has(walker.id)).toBe(true);

    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 2);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(sockets).toHaveLength(2);
    last().serverOpens();
    expect(last().sentTypes()).toEqual(['hello']);

    last().serverSends(serverMessage('delta', delta({ step: 140 })));
    expect(store.current?.latest.step).toBe(101);

    last().serverSends(
      serverMessage('snapshot', { ...snapshot, step: 150, people: [], units: [] }),
    );
    expect(store.current?.previous).toBeNull();
    expect(store.current?.latest.step).toBe(150);
    expect(store.current?.latest.people.size).toBe(0);
    expect(store.current?.latest.units.size).toBe(0);
  });
});

describe('gameSocketUrl', () => {
  it('uses the page host and a secure socket on https', () => {
    expect(gameSocketUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
    expect(gameSocketUrl({ protocol: 'https:', host: 'tower.example' })).toBe(
      'wss://tower.example/ws',
    );
  });

  it('points at the path the server serves the tower socket on', () => {
    const url = new URL(gameSocketUrl({ protocol: 'http:', host: 'localhost:5173' }));

    expect(url.pathname).toBe(TOWER_SOCKET_PATH);
  });
});
