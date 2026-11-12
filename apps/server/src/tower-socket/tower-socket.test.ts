import {
  addPerson,
  newUnit,
  removePerson,
  renamePerson,
  setStructure,
  structureAt,
} from '@tower-magnate/engine';
import {
  clientMessage,
  ServerMessageSchema,
  SnapshotSchema,
  TOWER_SOCKET_PATH,
} from '@tower-magnate/shared';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE_CODES, MAX_CLIENT_MESSAGE_BYTES } from '../gateway';
import { buildApp } from '../app';
import { createSnapshotRepository } from '../snapshots';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { TestSocketClient } from '../testing/socket-client';
import { createPlayer, type TestPlayer } from '../testing/tower-rows';

function messageOfBytes(bytes: number): string {
  const envelope = '{"t":"nope","padding":""}';
  return envelope.replace('""', `"${'x'.repeat(bytes - envelope.length)}"`);
}

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
    socketUrl = `${address.replace('http', 'ws')}${TOWER_SOCKET_PATH}`;
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

  it('refuses a socket that names a user but has no session', async () => {
    const client = await connect(undefined, `?user=${player.userId}`);

    expect(await client.waitForClose()).toBe(CLOSE_CODES.notAuthenticated);
    expect(app.towerRunner.isRunning(player.towerId)).toBe(false);
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

  it('keeps sending deltas after the snapshot', async () => {
    const client = await connect(player.cookie);
    client.hello();
    const snapshot = await client.next('snapshot');

    const delta = await client.next('delta');

    expect(delta.p.step).toBeGreaterThan(snapshot.p.step);
    expect(delta.p.cars).toEqual([]);
  });

  it('sends inspect data for a unit and again right after its price changes', async () => {
    const client = await connect(player.cookie);
    client.hello();
    await client.next('snapshot');
    const state = app.towerRunner.stateOf(player.towerId);
    if (!state) {
      throw new Error('Tower is not running');
    }
    state.units.u900 = newUnit('u900', 'office', 10, 2);

    client.sendRaw(
      JSON.stringify(clientMessage('inspect', { target: { kind: 'unit', id: 'u900' } })),
    );
    const first = await client.next('inspect');
    client.sendRaw(
      JSON.stringify(
        clientMessage('command', {
          id: 'c1',
          command: { type: 'setPrice', unitId: 'u900', price: 'low' },
        }),
      ),
    );
    const changed = await client.next('inspect');

    expect(first.p).toMatchObject({ id: 'u900', status: 'ok', details: { price: 'normal' } });
    expect(changed.p).toMatchObject({ id: 'u900', status: 'ok', details: { price: 'low' } });
  });

  it('answers gone for an unknown unit and then stops inspecting', async () => {
    const client = await connect(player.cookie);
    client.hello();
    await client.next('snapshot');

    client.sendRaw(
      JSON.stringify(clientMessage('inspect', { target: { kind: 'unit', id: 'u777' } })),
    );
    const gone = await client.next('inspect');
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(gone.p).toEqual({ kind: 'unit', id: 'u777', status: 'gone' });
    expect(client.received.filter((message) => message.t === 'inspect')).toEqual([]);
  });

  it('drops the inspect target when the client says hello again', async () => {
    const client = await connect(player.cookie);
    client.hello();
    await client.next('snapshot');
    const state = app.towerRunner.stateOf(player.towerId);
    if (!state) {
      throw new Error('Tower is not running');
    }
    state.units.u901 = newUnit('u901', 'office', 10, 2);
    client.sendRaw(
      JSON.stringify(clientMessage('inspect', { target: { kind: 'unit', id: 'u901' } })),
    );
    await client.next('inspect');

    client.hello();
    await client.next('snapshot');
    client.received.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(client.received.filter((message) => message.t === 'inspect')).toEqual([]);
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

  it('stops the tower when the last socket closes with an inspect target set', async () => {
    const client = await connect(player.cookie);
    client.hello();
    await client.next('snapshot');
    const state = app.towerRunner.stateOf(player.towerId);
    if (!state) {
      throw new Error('Tower is not running');
    }
    state.units.u902 = newUnit('u902', 'office', 10, 2);
    client.sendRaw(
      JSON.stringify(clientMessage('inspect', { target: { kind: 'unit', id: 'u902' } })),
    );
    await client.next('inspect');

    await client.close();
    await waitFor(() => !app.towerRunner.isRunning(player.towerId));
    const stepAtStop = app.towerRunner.stateOf(player.towerId)?.step;
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(app.towerRunner.isRunning(player.towerId)).toBe(false);
    expect(app.towerRunner.stateOf(player.towerId)?.step).toBe(stepAtStop);
  });

  it('does not run the tower for a socket that never said hello', async () => {
    await connect(player.cookie);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(app.towerRunner.isRunning(player.towerId)).toBe(false);
  });

  it('answers a message of exactly 64 KiB with an error and stays open', async () => {
    const client = await connect(player.cookie);
    const message = messageOfBytes(MAX_CLIENT_MESSAGE_BYTES);
    expect(Buffer.byteLength(message)).toBe(65_536);

    client.sendRaw(message);
    const error = await client.next('error');

    expect(error.p.code).toBe('INVALID_COMMAND');
    expect(client.closeCode).toBeUndefined();
  });

  it('closes with 1009 on a message one byte over 64 KiB and leaves other sockets open', async () => {
    const oversized = await connect(player.cookie);
    const other = await connect(player.cookie);
    other.hello();
    await other.next('snapshot');

    oversized.sendRaw(messageOfBytes(MAX_CLIENT_MESSAGE_BYTES + 1));

    expect(await oversized.waitForClose()).toBe(1009);
    other.sendRaw(JSON.stringify(clientMessage('ping', { clientTime: 7 })));
    expect((await other.next('pong')).p.clientTime).toBe(7);
  });

  describe('commands', () => {
    function sendCommand(client: TestSocketClient, id: string, command: object): void {
      client.sendRaw(JSON.stringify(clientMessage('command', { id, command } as never)));
    }

    async function connectWithLobby(): Promise<TestSocketClient> {
      const client = await connect(player.cookie);
      client.hello();
      await client.next('snapshot');
      const state = app.towerRunner.stateOf(player.towerId);
      if (!state) throw new Error('Tower is not running');
      setStructure(state.grid, 1, 10, 29, 'lobby');
      state.grid.mainLobbyHeight = 1;
      return client;
    }

    it('answers a malformed command with a failed commandResult and keeps the socket open', async () => {
      const client = await connectWithLobby();

      sendCommand(client, 'x1', {
        type: 'configureShaft',
        shaftId: 's1',
        stops: [1],
        carHomes: [1],
        schedule: { weekday: [], weekend: [] },
      });
      const result = await client.next('commandResult');

      expect(result.p).toEqual({
        id: 'x1',
        ok: false,
        step: expect.any(Number),
        error: 'INVALID_COMMAND',
      });
      expect(client.received.filter((message) => message.t === 'error')).toEqual([]);
      expect(client.closeCode).toBeUndefined();
    });

    it('answers a command without an id with an error frame', async () => {
      const client = await connectWithLobby();

      client.sendRaw(
        JSON.stringify({ v: 1, t: 'command', p: { command: { type: 'buildFloor' } } }),
      );
      const error = await client.next('error');

      expect(error.p.code).toBe('INVALID_COMMAND');
      expect(client.received.filter((message) => message.t === 'commandResult')).toEqual([]);
    });

    it('builds a floor, answers with its cost and saves the tower while it keeps running', async () => {
      const client = await connectWithLobby();

      sendCommand(client, 'c1', { type: 'buildFloor', level: 2, x0: 10, x1: 19 });
      const result = await client.next('commandResult');

      expect(result.p).toMatchObject({ id: 'c1', ok: true, cost: 5000, refund: 0 });
      const state = app.towerRunner.stateOf(player.towerId);
      expect(state && structureAt(state.grid, 2, 10)).toBe('floor');
      const snapshots = createSnapshotRepository(pool);
      let saved = await snapshots.loadLatest(player.towerId);
      for (let attempt = 0; attempt < 300 && !saved; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        saved = await snapshots.loadLatest(player.towerId);
      }
      expect(saved && structureAt(saved.state.grid, 2, 10)).toBe('floor');
    });

    it('returns the engine code of a rejected command', async () => {
      const client = await connectWithLobby();

      sendCommand(client, 'c2', { type: 'buildFloor', level: 5, x0: 10, x1: 19 });
      const result = await client.next('commandResult');

      expect(result.p).toMatchObject({ id: 'c2', ok: false, error: 'NO_SUPPORT' });
    });
  });

  describe('people', () => {
    function sendCommand(client: TestSocketClient, id: string, command: object): void {
      client.sendRaw(JSON.stringify(clientMessage('command', { id, command } as never)));
    }

    async function connectWithPeople(count: number): Promise<TestSocketClient> {
      const client = await connect(player.cookie);
      client.hello();
      await client.next('snapshot');
      const state = app.towerRunner.stateOf(player.towerId);
      if (!state) throw new Error('Tower is not running');
      for (let index = 0; index < count; index += 1) {
        addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 12 });
      }
      return client;
    }

    async function resultOf(client: TestSocketClient, id: string, command: object) {
      sendCommand(client, id, command);
      return (await client.next('commandResult')).p;
    }

    it('inspects a person, answers again after a rename and then says gone', async () => {
      const client = await connectWithPeople(1);

      client.sendRaw(
        JSON.stringify(clientMessage('inspect', { target: { kind: 'person', id: 'p1' } })),
      );
      const first = await client.next('inspect');
      const renamed = await resultOf(client, 'r1', {
        type: 'renamePerson',
        personId: 'p1',
        name: 'Ana',
      });
      const second = await client.next('inspect');
      const state = app.towerRunner.stateOf(player.towerId);
      if (state) removePerson(state, 1);
      const gone = await client.next('inspect');

      expect(first.p).toMatchObject({ kind: 'person', id: 'p1', status: 'ok', name: null });
      expect(renamed).toMatchObject({ id: 'r1', ok: true });
      expect(second.p).toMatchObject({ id: 'p1', status: 'ok', name: 'Ana' });
      expect(gone.p).toEqual({ kind: 'person', id: 'p1', status: 'gone' });
    });

    it('follows 20 named people, refuses the 21st and the unnamed, and unfollows', async () => {
      const client = await connectWithPeople(22);
      const state = app.towerRunner.stateOf(player.towerId);
      if (!state) throw new Error('Tower is not running');
      for (let id = 1; id <= 21; id += 1) renamePerson(state.people, id, `Persona ${id}`);

      const unnamed = await resultOf(client, 'f22', { type: 'followPerson', personId: 'p22' });
      for (let id = 1; id <= 20; id += 1) {
        const followed = await resultOf(client, `f${id}`, {
          type: 'followPerson',
          personId: `p${id}`,
        });
        expect(followed.ok).toBe(true);
      }
      const twentyFirst = await resultOf(client, 'f21', { type: 'followPerson', personId: 'p21' });
      const unfollowed = await resultOf(client, 'u3', { type: 'unfollowPerson', personId: 'p3' });
      const afterUnfollow = await resultOf(client, 'f21b', {
        type: 'followPerson',
        personId: 'p21',
      });

      expect(unnamed).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
      expect(twentyFirst).toMatchObject({ ok: false, error: 'FOLLOW_LIMIT' });
      expect(unfollowed.ok).toBe(true);
      expect(afterUnfollow.ok).toBe(true);
    });

    it('sends the followed list with names and saves it with the tower', async () => {
      const client = await connectWithPeople(2);
      await resultOf(client, 'n1', { type: 'renamePerson', personId: 'p1', name: 'Ana' });
      await resultOf(client, 'f1', { type: 'followPerson', personId: 'p1' });

      const named = await client.next('delta');
      const snapshots = createSnapshotRepository(pool);
      let saved = await snapshots.loadLatest(player.towerId);
      for (let attempt = 0; attempt < 300 && !saved?.state.people.followed.length; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        saved = await snapshots.loadLatest(player.towerId);
      }

      expect(named.p.followed).toEqual([expect.objectContaining({ id: 'p1', name: 'Ana' })]);
      expect(saved?.state.people.names).toEqual({ 1: 'Ana' });
      expect(saved?.state.people.followed).toEqual([1]);
    });
  });
});
