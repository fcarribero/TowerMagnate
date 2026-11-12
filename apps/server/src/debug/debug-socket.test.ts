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

    client.sendRaw(
      debugFrame('debug.setClock', { id: 'd', year: 1, month: 12, day: 24, time: '10:00' }),
    );
    client.sendRaw(debugFrame('debug.forceEvent', { id: 'w', kind: 'wedding' }));
    client.sendRaw(debugFrame('debug.forceEvent', { id: 'i', kind: 'infestation', unitId: 'u1' }));

    await waitFor(() => results(client).length === 7);
    // A new tower has no fire spot, cathedral or hotel room, so the engine refuses those events.
    expect(results(client).map((result) => [result.id, result.ok])).toEqual([
      ['m', true],
      ['e', false],
      ['f', true],
      ['c', true],
      ['d', true],
      ['w', false],
      ['i', false],
    ]);
  });

  it('answers NOT_ALLOWED to every debug message when they are off', async () => {
    const client = await connectTo(false);

    client.sendRaw(debugFrame('debug.setMoney', { amount: 777 }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'bomb' }));
    client.sendRaw(debugFrame('debug.fastForward', { steps: 10 }));
    client.sendRaw(debugFrame('debug.setClock', { day: 1, time: '10:00' }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'santa' }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'wedding' }));
    client.sendRaw(debugFrame('debug.forceEvent', { kind: 'infestation', unitId: 'u1' }));
    client.sendRaw(debugFrame('debug.setClock', { year: 1, month: 12, day: 24, time: '10:00' }));

    await waitFor(() => errors(client).length === 8);
    expect(errors(client).map((error) => error.p.code)).toEqual(Array(8).fill('NOT_ALLOWED'));
    expect(results(client)).toEqual([]);
  });

  it('refuses a malformed debug message', async () => {
    const client = await connectTo(true);

    client.sendRaw(debugFrame('debug.fastForward', { steps: 8_641 }));

    await waitFor(() => errors(client).length === 1);
    expect(errors(client)[0]?.p.code).toBe('INVALID_COMMAND');
  });

  it('sends the santa notice to the player and keeps it in the notices', async () => {
    const client = await connectTo(true);
    await client.next('delta');

    client.sendRaw(debugFrame('debug.forceEvent', { id: 's', kind: 'santa' }));

    await waitFor(
      () =>
        results(client).length === 1 &&
        santaEvents(client).length === 1 &&
        storedSantaNotices(client).length === 1,
    );
    expect(results(client)[0]).toEqual(expect.objectContaining({ id: 's', ok: true }));
  });

  it('reports a refused event as a failed result', async () => {
    const client = await connectTo(true);

    client.sendRaw(debugFrame('debug.forceEvent', { id: 'a', kind: 'fire' }));
    client.sendRaw(debugFrame('debug.forceEvent', { id: 'b', kind: 'bomb' }));

    await waitFor(() => results(client).length === 2);
    expect(results(client).map((result) => result.ok)).toEqual([false, false]);
  });

  function results(client: TestSocketClient) {
    return client.received.flatMap((message) => (message.t === 'commandResult' ? [message.p] : []));
  }

  function santaEvents(client: TestSocketClient) {
    return client.received.filter(
      (message) => message.t !== 'delta' && JSON.stringify(message).includes('news.santa'),
    );
  }

  function storedSantaNotices(client: TestSocketClient) {
    return client.received.filter(
      (message) =>
        message.t === 'delta' && JSON.stringify(message.p.notices ?? []).includes('news.santa'),
    );
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
