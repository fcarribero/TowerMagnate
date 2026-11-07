import { clientMessage, ServerMessageSchema, SnapshotSchema } from '@tower-magnate/shared';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE_CODES } from '../gateway';
import { buildApp } from '../app';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { TestSocketClient } from '../testing/socket-client';
import { createPlayer, type TestPlayer } from '../testing/tower-rows';

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
}

describe('tower socket against postgres', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let app: FastifyInstance;
  let socketUrl: string;
  let player: TestPlayer;
  const clients: TestSocketClient[] = [];

  async function connect(cookie: string | undefined, query = ''): Promise<TestSocketClient> {
    const client = await TestSocketClient.open(`${socketUrl}${query}`, cookie);
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
    app = buildApp({ version: 'test', databaseUrl: database.url, runnerTickIntervalMs: 20 });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    socketUrl = `${address.replace('http', 'ws')}/ws`;
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await database?.stop();
  });

  beforeEach(async () => {
    player = await createPlayer(pool);
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it('refuses a socket without a session cookie', async () => {
    const client = await connect(undefined);

    expect(await client.waitForClose()).toBe(CLOSE_CODES.notAuthenticated);
    expect(client.received).toEqual([
      expect.objectContaining({
        t: 'error',
        p: expect.objectContaining({ code: 'NOT_AUTHENTICATED' }),
      }),
    ]);
  });

  it('refuses a socket with an unknown session', async () => {
    const client = await connect('tm_session=forged');

    expect(await client.waitForClose()).toBe(CLOSE_CODES.notAuthenticated);
  });

  it('refuses a tower that belongs to another user', async () => {
    const other = await createPlayer(pool);

    const client = await connect(player.cookie, `?tower=${other.towerId}`);

    expect(await client.waitForClose()).toBe(CLOSE_CODES.notAuthenticated);
    expect(app.towerRunner.isRunning(other.towerId)).toBe(false);
  });

  it('closes on a protocol mismatch', async () => {
    const client = await connect(player.cookie);

    client.hello(99);

    expect(await client.waitForClose()).toBe(CLOSE_CODES.protocolMismatch);
    expect(client.received).toEqual([
      expect.objectContaining({
        t: 'error',
        p: expect.objectContaining({ code: 'PROTOCOL_MISMATCH' }),
      }),
    ]);
    expect(app.towerRunner.isRunning(player.towerId)).toBe(false);
  });

  it('answers hello with a snapshot that passes the shared schema and has no rng', async () => {
    const client = await connect(player.cookie, `?tower=${player.towerId}`);

    client.hello();
    const message = await client.next('snapshot');

    expect(ServerMessageSchema.safeParse(message).success).toBe(true);
    expect(SnapshotSchema.parse(message.p)).toBeDefined();
    expect(message.p).not.toHaveProperty('rng');
    expect(JSON.stringify(message)).not.toContain('"rng"');
    expect(message.p.money).toBeGreaterThan(0);
  });

  it('sends a fresh snapshot when the client says hello again', async () => {
    const client = await connect(player.cookie);
    client.hello();
    const first = await client.next('snapshot');
    await waitFor(() => (app.towerRunner.stateOf(player.towerId)?.step ?? 0) > first.p.step);

    client.hello();
    const second = await client.next('snapshot');

    expect(second.p.step).toBeGreaterThan(first.p.step);
  });

  it('answers ping with pong and the server step', async () => {
    const client = await connect(player.cookie);
    client.hello();
    await client.next('snapshot');

    client.sendRaw(JSON.stringify(clientMessage('ping', { clientTime: 42 })));
    const pong = await client.next('pong');

    expect(pong.p.clientTime).toBe(42);
    expect(pong.p.serverStep).toBeGreaterThanOrEqual(0);
  });

  it('keeps one running tower for two tabs until both close', async () => {
    const first = await connect(player.cookie);
    const second = await connect(player.cookie);
    first.hello();
    second.hello();
    await first.next('snapshot');
    await second.next('snapshot');
    expect(app.towerConnections.socketsForTower(player.towerId)).toHaveLength(2);

    await first.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(app.towerRunner.isRunning(player.towerId)).toBe(true);

    await second.close();
    await waitFor(() => !app.towerRunner.isRunning(player.towerId));
  });

  it('does not run the tower for a socket that never said hello', async () => {
    await connect(player.cookie);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(app.towerRunner.isRunning(player.towerId)).toBe(false);
  });
});
