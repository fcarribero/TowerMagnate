import { PROTOCOL_VERSION, TOWER_SOCKET_PATH } from '@tower-magnate/shared';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { TestSocketClient } from '../testing/socket-client';
import { createPlayer } from '../testing/tower-rows';

function debugFrame(t: string, p: object): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, t, p });
}

describe('debug messages over the tower socket', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  const apps: FastifyInstance[] = [];
  const clients: TestSocketClient[] = [];

  async function connectTo(debugCommands: boolean): Promise<TestSocketClient> {
    const app = buildApp({
      version: 'test',
      databaseUrl: database.url,
      runnerTickIntervalMs: 20,
      debugCommands,
    });
    apps.push(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const player = await createPlayer(pool);
    const url = `${address.replace('http', 'ws')}${TOWER_SOCKET_PATH}`;
    const client = await TestSocketClient.open(url, player.cookie);
    clients.push(client);
    client.hello();
    await client.next('snapshot');
    return client;
  }

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  afterAll(async () => {
    await pool?.end();
    await database?.stop();
  });

  it('runs every command when debug commands are on', async () => {
    const client = await connectTo(true);

    client.sendRaw(debugFrame('debug.setMoney', { id: 'm', amount: 777 }));
    client.sendRaw(debugFrame('debug.forceEvent', { id: 'e', kind: 'fire' }));
    client.sendRaw(debugFrame('debug.fastForward', { id: 'f', steps: 100 }));
    client.sendRaw(debugFrame('debug.setClock', { id: 'c', day: 3, time: '12:00' }));

    await waitFor(() => results(client).length === 4);
    expect(results(client).map((result) => [result.id, result.ok])).toEqual([
      ['m', true],
      ['e', true],
      ['f', true],
      ['c', true],
    ]);
  });

  it('answers NOT_ALLOWED to every debug message when they are off', async () => {
    const client = await connectTo(false);

    client.sendRaw(debugFrame('debug.setMoney', { amount: 777 }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'bomb' }));
    client.sendRaw(debugFrame('debug.fastForward', { steps: 10 }));
    client.sendRaw(debugFrame('debug.setClock', { day: 1, time: '10:00' }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'santa' }));

    await waitFor(() => errors(client).length === 5);
    expect(errors(client).map((error) => error.p.code)).toEqual(Array(5).fill('NOT_ALLOWED'));
    expect(results(client)).toEqual([]);
  });

  it('refuses a malformed debug message', async () => {
    const client = await connectTo(true);

    client.sendRaw(debugFrame('debug.fastForward', { steps: 8_641 }));

    await waitFor(() => errors(client).length === 1);
    expect(errors(client)[0]?.p.code).toBe('INVALID_COMMAND');
  });

  it('sends the santa notice to the player', async () => {
    const client = await connectTo(true);
    await client.next('delta');

    client.sendRaw(debugFrame('debug.forceEvent', { id: 's', kind: 'santa' }));

    await waitFor(() => results(client).length === 1 && santaNotices(client).length === 1);
    expect(results(client)[0]).toEqual(expect.objectContaining({ id: 's', ok: true }));
  });

  it('reports a refused event as a failed result', async () => {
    const client = await connectTo(true);

    client.sendRaw(debugFrame('debug.forceEvent', { id: 'a', kind: 'fire' }));
    client.sendRaw(debugFrame('debug.forceEvent', { id: 'b', kind: 'bomb' }));

    await waitFor(() => results(client).length === 2);
    expect(results(client).map((result) => result.ok)).toEqual([true, false]);
  });

  function results(client: TestSocketClient) {
    return client.received.flatMap((message) => (message.t === 'commandResult' ? [message.p] : []));
  }

  function santaNotices(client: TestSocketClient) {
    return client.received.filter((message) => JSON.stringify(message).includes('news.santa'));
  }

  function errors(client: TestSocketClient) {
    return client.received.flatMap((message) => (message.t === 'error' ? [message] : []));
  }

  async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(condition()).toBe(true);
  }
});
