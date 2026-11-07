import { describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../testing/fake-socket';
import { Gateway } from './gateway';
import { MAX_MESSAGES_PER_SECOND } from './rate-limiter';
import type { SocketIdentity } from './socket';

const ALICE_TOWER: SocketIdentity = { userId: 'alice', towerId: 'tower-1' };
const BOB_TOWER: SocketIdentity = { userId: 'bob', towerId: 'tower-2' };

function watchActivity(gateway: Gateway) {
  const activated: SocketIdentity[] = [];
  const deactivated: SocketIdentity[] = [];
  gateway.registry.on('tower-activated', (identity) => activated.push(identity));
  gateway.registry.on('tower-deactivated', (identity) => deactivated.push(identity));
  return { activated, deactivated };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('tower activation', () => {
  it('emits one activated and one deactivated event for two sockets on one tower', () => {
    const gateway = new Gateway({});
    const events = watchActivity(gateway);
    const first = new FakeSocket();
    const second = new FakeSocket();

    gateway.attach(first, ALICE_TOWER);
    gateway.attach(second, ALICE_TOWER);
    expect(events.activated).toEqual([ALICE_TOWER]);

    first.close();
    expect(events.deactivated).toEqual([]);
    expect(gateway.registry.isTowerActive('tower-1')).toBe(true);

    second.close();
    expect(events.deactivated).toEqual([ALICE_TOWER]);
    expect(gateway.registry.isTowerActive('tower-1')).toBe(false);
  });

  it('tracks towers independently', () => {
    const gateway = new Gateway({});
    const events = watchActivity(gateway);
    const alice = new FakeSocket();
    const bob = new FakeSocket();

    gateway.attach(alice, ALICE_TOWER);
    gateway.attach(bob, BOB_TOWER);
    alice.close();

    expect(events.activated).toEqual([ALICE_TOWER, BOB_TOWER]);
    expect(events.deactivated).toEqual([ALICE_TOWER]);
    expect(gateway.registry.socketsForUser('bob')).toEqual([bob]);
  });

  it('ignores a second close of the same socket', () => {
    const gateway = new Gateway({});
    const events = watchActivity(gateway);
    const socket = new FakeSocket();

    gateway.attach(socket, ALICE_TOWER);
    socket.close();
    socket.close();

    expect(events.deactivated).toHaveLength(1);
  });

  it('activates the tower again after it was deactivated', () => {
    const gateway = new Gateway({});
    const events = watchActivity(gateway);
    const first = new FakeSocket();
    gateway.attach(first, ALICE_TOWER);
    first.close();

    gateway.attach(new FakeSocket(), ALICE_TOWER);

    expect(events.activated).toHaveLength(2);
  });
});

describe('message routing', () => {
  it('passes a known message to its handler with the socket identity', async () => {
    const handler = vi.fn();
    const gateway = new Gateway({ hello: handler });
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive('{"type":"hello","name":"x"}');
    await flush();

    expect(handler).toHaveBeenCalledWith(
      { type: 'hello', name: 'x' },
      { socket, identity: ALICE_TOWER },
    );
  });

  it('answers an unknown type with an error frame and keeps the socket open', async () => {
    const gateway = new Gateway({});
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive('{"type":"nope"}');
    await flush();

    expect(socket.sent).toEqual([
      { type: 'error', code: 'unknown-message-type', message: 'Unknown message type "nope"' },
    ]);
    expect(socket.terminated).toBe(false);
    expect(gateway.registry.isTowerActive('tower-1')).toBe(true);
  });

  it('does not treat inherited object keys as message types', async () => {
    const gateway = new Gateway({});
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive('{"type":"toString"}');
    await flush();

    expect(socket.sent).toEqual([expect.objectContaining({ code: 'unknown-message-type' })]);
  });

  it.each(['not json', '[]', '{"type":3}', 'null'])('rejects malformed frame %s', async (text) => {
    const gateway = new Gateway({});
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive(text);
    await flush();

    expect(socket.sent).toEqual([
      expect.objectContaining({ type: 'error', code: 'invalid-message' }),
    ]);
    expect(socket.terminated).toBe(false);
  });

  it('answers with an error frame when a handler throws', async () => {
    const gateway = new Gateway({
      explode: () => {
        throw new Error('boom');
      },
    });
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive('{"type":"explode"}');
    await flush();

    expect(socket.sent).toEqual([expect.objectContaining({ code: 'handler-failed' })]);
  });
});

describe('rate limit', () => {
  function gatewayAt(clock: { now: number }, warn = vi.fn()) {
    return new Gateway({ hello: () => {} }, { now: () => clock.now, logger: { warn } });
  }

  function sendHellos(socket: FakeSocket, count: number): void {
    for (let index = 0; index < count; index += 1) {
      socket.receive('{"type":"hello"}');
    }
  }

  it('rejects the 31st message in one second, logs it and keeps the socket open', async () => {
    const clock = { now: 0 };
    const warn = vi.fn();
    const gateway = gatewayAt(clock, warn);
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    sendHellos(socket, MAX_MESSAGES_PER_SECOND);
    await flush();
    expect(socket.sent).toEqual([]);

    sendHellos(socket, 1);
    await flush();

    expect(socket.sent).toEqual([expect.objectContaining({ type: 'error', code: 'rate-limited' })]);
    expect(warn).toHaveBeenCalledWith(ALICE_TOWER, expect.stringContaining('rate limit'));
    expect(socket.terminated).toBe(false);
  });

  it('accepts messages again in the next second', async () => {
    const clock = { now: 0 };
    const gateway = gatewayAt(clock);
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);
    sendHellos(socket, MAX_MESSAGES_PER_SECOND);

    clock.now = 1000;
    sendHellos(socket, MAX_MESSAGES_PER_SECOND);
    await flush();

    expect(socket.sent).toEqual([]);
  });

  it('counts each connection separately', async () => {
    const clock = { now: 0 };
    const gateway = gatewayAt(clock);
    const noisy = new FakeSocket();
    const quiet = new FakeSocket();
    gateway.attach(noisy, ALICE_TOWER);
    gateway.attach(quiet, ALICE_TOWER);

    sendHellos(noisy, 40);
    sendHellos(quiet, MAX_MESSAGES_PER_SECOND);
    await flush();

    expect(noisy.sent).toHaveLength(10);
    expect(quiet.sent).toEqual([]);
  });
});

describe('heartbeat', () => {
  it('drops a socket that misses two pings and deactivates its tower', () => {
    const gateway = new Gateway({});
    const events = watchActivity(gateway);
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    gateway.tickHeartbeat();
    gateway.tickHeartbeat();
    expect(socket.pings).toBe(2);
    expect(socket.terminated).toBe(false);

    gateway.tickHeartbeat();
    expect(socket.terminated).toBe(true);
    expect(events.deactivated).toEqual([ALICE_TOWER]);
  });

  it('keeps a socket that answers its pings', () => {
    const gateway = new Gateway({});
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    for (let tick = 0; tick < 5; tick += 1) {
      gateway.tickHeartbeat();
      socket.answerPing();
    }

    expect(socket.pings).toBe(5);
    expect(socket.terminated).toBe(false);
  });

  it('pings on the configured interval', () => {
    vi.useFakeTimers();
    try {
      const gateway = new Gateway({});
      const socket = new FakeSocket();
      gateway.attach(socket, ALICE_TOWER);
      const stop = gateway.startHeartbeat(30_000);

      vi.advanceTimersByTime(30_000);
      expect(socket.pings).toBe(1);
      vi.advanceTimersByTime(60_000);
      expect(socket.terminated).toBe(true);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
