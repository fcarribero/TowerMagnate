import { clientMessage, PROTOCOL_VERSION } from '@tower-magnate/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../testing/fake-socket';
import { Gateway } from './gateway';
import { MAX_MESSAGE_BYTES, type MessageHandlers } from './message-router';
import { CLOSE_CODES, type SocketIdentity } from './socket';

const ALICE_TOWER: SocketIdentity = { userId: 'alice', towerId: 'tower-1' };
const BOB_TOWER: SocketIdentity = { userId: 'bob', towerId: 'tower-2' };

const HELLO = JSON.stringify(clientMessage('hello', { protocol: PROTOCOL_VERSION }));
const PING = JSON.stringify(clientMessage('ping', { clientTime: 5 }));

const joinOnHello: MessageHandlers = { hello: (_message, { join }) => join() };

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

async function joinedSocket(gateway: Gateway, identity: SocketIdentity): Promise<FakeSocket> {
  const socket = new FakeSocket();
  gateway.attach(socket, identity);
  socket.receive(HELLO);
  await flush();
  return socket;
}

function errorFrame(code: string) {
  return { v: PROTOCOL_VERSION, t: 'error', p: expect.objectContaining({ code }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('tower activation', () => {
  it('does not activate the tower before the socket joins', () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);

    gateway.attach(new FakeSocket(), ALICE_TOWER);

    expect(events.activated).toEqual([]);
  });

  it('emits one activated and one deactivated event for two sockets on one tower', async () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);
    const first = await joinedSocket(gateway, ALICE_TOWER);
    const second = await joinedSocket(gateway, ALICE_TOWER);
    expect(events.activated).toEqual([ALICE_TOWER]);

    first.close();
    expect(events.deactivated).toEqual([]);
    expect(gateway.registry.isTowerActive('tower-1')).toBe(true);

    second.close();
    expect(events.deactivated).toEqual([ALICE_TOWER]);
    expect(gateway.registry.isTowerActive('tower-1')).toBe(false);
  });

  it('tracks towers independently', async () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);
    const alice = await joinedSocket(gateway, ALICE_TOWER);
    const bob = await joinedSocket(gateway, BOB_TOWER);

    alice.close();

    expect(events.activated).toEqual([ALICE_TOWER, BOB_TOWER]);
    expect(events.deactivated).toEqual([ALICE_TOWER]);
    expect(gateway.registry.socketsForUser('bob')).toEqual([bob]);
  });

  it('ignores a second close of the same socket', async () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    socket.close();
    socket.close();

    expect(events.deactivated).toHaveLength(1);
  });

  it('activates the tower again after it was deactivated', async () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);
    const first = await joinedSocket(gateway, ALICE_TOWER);
    first.close();

    await joinedSocket(gateway, ALICE_TOWER);

    expect(events.activated).toHaveLength(2);
  });
});

describe('message routing', () => {
  it('passes a valid message to its handler with the socket identity', async () => {
    const ping = vi.fn();
    const gateway = new Gateway({ ...joinOnHello, ping });
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    socket.receive(PING);
    await flush();

    expect(ping).toHaveBeenCalledWith(
      { v: PROTOCOL_VERSION, t: 'ping', p: { clientTime: 5 } },
      expect.objectContaining({ socket, identity: ALICE_TOWER }),
    );
  });

  it('drops messages that arrive before hello', async () => {
    const ping = vi.fn();
    const gateway = new Gateway({ ...joinOnHello, ping });
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive(PING);
    await flush();

    expect(ping).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
  });

  it('answers a type without a handler with an error and keeps the socket open', async () => {
    const gateway = new Gateway(joinOnHello);
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    socket.receive(PING);
    await flush();

    expect(socket.sent).toEqual([errorFrame('INVALID_COMMAND')]);
    expect(socket.closeCode).toBeUndefined();
    expect(gateway.registry.isTowerActive('tower-1')).toBe(true);
  });

  it.each([
    'not json',
    '[]',
    '{"t":"hello"}',
    '{"v":1,"t":"nope","p":{}}',
    '{"v":1,"t":"toString","p":{}}',
    '{"v":1,"t":"viewport","p":{"levelFrom":"a"}}',
  ])('rejects the invalid message %s with an error frame', async (text) => {
    const gateway = new Gateway(joinOnHello);
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    socket.receive(text);
    await flush();

    expect(socket.sent).toEqual([errorFrame('INVALID_COMMAND')]);
    expect(socket.closeCode).toBeUndefined();
  });

  it('rejects a message over the size limit', async () => {
    const ping = vi.fn();
    const gateway = new Gateway({ ...joinOnHello, ping });
    const socket = await joinedSocket(gateway, ALICE_TOWER);
    const padding = ' '.repeat(MAX_MESSAGE_BYTES);

    socket.receive(PING + padding);
    await flush();

    expect(ping).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([errorFrame('INVALID_COMMAND')]);
  });

  it('answers with an error frame when a handler throws', async () => {
    const gateway = new Gateway({
      ...joinOnHello,
      ping: () => {
        throw new Error('boom');
      },
    });
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    socket.receive(PING);
    await flush();

    expect(socket.sent).toEqual([errorFrame('INVALID_COMMAND')]);
  });
});

describe('hello timeout', () => {
  it('closes a socket that sends no hello in time', () => {
    vi.useFakeTimers();
    const gateway = new Gateway(joinOnHello, { helloTimeoutMs: 5_000 });
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    vi.advanceTimersByTime(5_000);

    expect(socket.closeCode).toBe(CLOSE_CODES.noHello);
  });

  it('keeps a socket that said hello', async () => {
    vi.useFakeTimers();
    const gateway = new Gateway(joinOnHello, { helloTimeoutMs: 5_000 });
    const socket = new FakeSocket();
    gateway.attach(socket, ALICE_TOWER);

    socket.receive(HELLO);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(socket.closeCode).toBeUndefined();
  });
});

describe('heartbeat', () => {
  it('drops a socket that misses two pings and deactivates its tower', async () => {
    const gateway = new Gateway(joinOnHello);
    const events = watchActivity(gateway);
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    gateway.tickHeartbeat();
    gateway.tickHeartbeat();
    expect(socket.pings).toBe(2);
    expect(socket.terminated).toBe(false);

    gateway.tickHeartbeat();
    expect(socket.terminated).toBe(true);
    expect(events.deactivated).toEqual([ALICE_TOWER]);
  });

  it('keeps a socket that answers its pings', async () => {
    const gateway = new Gateway(joinOnHello);
    const socket = await joinedSocket(gateway, ALICE_TOWER);

    for (let tick = 0; tick < 5; tick += 1) {
      gateway.tickHeartbeat();
      socket.answerPing();
    }

    expect(socket.pings).toBe(5);
    expect(socket.terminated).toBe(false);
  });

  it('pings on the configured interval', async () => {
    const gateway = new Gateway(joinOnHello);
    const socket = await joinedSocket(gateway, ALICE_TOWER);
    vi.useFakeTimers();
    const stop = gateway.startHeartbeat(30_000);

    vi.advanceTimersByTime(30_000);
    expect(socket.pings).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(socket.terminated).toBe(true);
    stop();
  });
});
