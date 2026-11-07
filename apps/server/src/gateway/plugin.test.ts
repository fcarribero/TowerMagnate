import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../app';
import { MAX_CLIENT_MESSAGE_BYTES } from './plugin';
import type { SocketIdentity } from './socket';

const UNUSED_DATABASE_URL = 'postgres://tower:tower@127.0.0.1:1/tower';

function openSocket(baseUrl: string, path: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}${path}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextFrame(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) =>
    socket.once('message', (data) => resolve(JSON.parse(String(data)))),
  );
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

function messageOfBytes(bytes: number): string {
  const envelope = '{"type":"nope","padding":""}';
  return envelope.replace('""', `"${'x'.repeat(bytes - envelope.length)}"`);
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
}

describe('tower websocket endpoint', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const activated: SocketIdentity[] = [];
  const deactivated: SocketIdentity[] = [];

  beforeEach(async () => {
    activated.length = 0;
    deactivated.length = 0;
    app = buildApp({ version: 'test', databaseUrl: UNUSED_DATABASE_URL });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected a TCP address');
    }
    baseUrl = `ws://127.0.0.1:${address.port}`;
    app.towerConnections.on('tower-activated', (identity) => activated.push(identity));
    app.towerConnections.on('tower-deactivated', (identity) => deactivated.push(identity));
  });

  afterEach(async () => {
    await app.close();
  });

  it('activates a tower once for two sockets and deactivates it after both close', async () => {
    const first = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const second = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    await waitFor(() => app.towerConnections.socketsForTower('t1').length === 2);
    expect(activated).toEqual([{ userId: 'alice', towerId: 't1' }]);

    await closeSocket(first);
    await waitFor(() => app.towerConnections.socketsForTower('t1').length === 1);
    expect(deactivated).toEqual([]);

    await closeSocket(second);
    await waitFor(() => deactivated.length === 1);
    expect(deactivated).toEqual([{ userId: 'alice', towerId: 't1' }]);
  });

  it('answers an unknown message type with an error frame and stays open', async () => {
    const socket = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const frame = nextFrame(socket);
    socket.send('{"type":"nope"}');

    expect(await frame).toMatchObject({ type: 'error', code: 'unknown-message-type' });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    await closeSocket(socket);
  });

  it('accepts a message of exactly 64 KiB', async () => {
    const socket = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const frame = nextFrame(socket);
    const message = messageOfBytes(MAX_CLIENT_MESSAGE_BYTES);
    expect(Buffer.byteLength(message)).toBe(65_536);

    socket.send(message);

    expect(await frame).toMatchObject({ type: 'error', code: 'unknown-message-type' });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    await closeSocket(socket);
  });

  it('closes with 1009 on a message one byte over 64 KiB and leaves other sockets open', async () => {
    const oversized = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const other = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const closed = closeCode(oversized);

    oversized.send(messageOfBytes(MAX_CLIENT_MESSAGE_BYTES + 1));

    expect(await closed).toBe(1009);
    const frame = nextFrame(other);
    other.send('{"type":"nope"}');
    expect(await frame).toMatchObject({ code: 'unknown-message-type' });
    await closeSocket(other);
  });

  it('answers malformed JSON with an error frame and stays open', async () => {
    const socket = await openSocket(baseUrl, '/ws/towers/t1?user=alice');
    const frame = nextFrame(socket);
    socket.send('{"type":');

    expect(await frame).toMatchObject({ type: 'error', code: 'invalid-message' });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    await closeSocket(socket);
  });

  it('refuses the upgrade without an identity', async () => {
    await expect(openSocket(baseUrl, '/ws/towers/t1')).rejects.toThrow(/401/);
    expect(activated).toEqual([]);
  });
});
