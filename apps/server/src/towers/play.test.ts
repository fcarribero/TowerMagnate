import { randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { serializeState } from '@tower-magnate/engine';
import {
  PLAY_TOKEN_HEADER,
  TOWER_PLAY_PATH,
  TOWER_STATE_PATH,
  type PlayResponse,
  type TowerState,
} from '@tower-magnate/shared';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { SESSION_COOKIE } from '../auth/routes';
import { createSession } from '../auth/sessions';
import { createSnapshotRepository } from '../snapshots';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { createPlayer } from '../testing/tower-rows';
import { towerAtStep } from '../testing/towers';
import {
  InvalidSaveError,
  MAX_SAVE_BYTES,
  savePlayedState,
  startPlay,
  StateTooLargeError,
} from './play';
import { resetTowerOf } from './repository';

function gz(state: TowerState): Buffer {
  return gzipSync(serializeState(state));
}

function stepOf(response: { state: unknown } | null): number {
  return (response?.state as TowerState).step;
}

describe('play and save', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
    app = buildApp({ version: 'test', databaseUrl: database.url, authAttemptsPerMinute: 1000 });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await database?.stop();
  });

  async function latestStep(towerId: string): Promise<number | undefined> {
    const snapshot = await createSnapshotRepository(pool).loadLatest(towerId);
    return snapshot?.step;
  }

  async function userWithoutTower(username: string): Promise<{ id: number; cookie: string }> {
    const result = await pool.query<{ id: string }>(
      `insert into users (username, password_hash) values ($1, 'hash') returning id`,
      [username],
    );
    const id = Number(result.rows[0]?.id);
    return { id, cookie: `${SESSION_COOKIE}=${await createSession(pool, id)}` };
  }

  it('play returns a fresh tower from the seed when never saved', async () => {
    const player = await createPlayer(pool);
    const play = await startPlay(pool, Number(player.userId));
    expect(play?.token).toBeTruthy();
    expect(stepOf(play)).toBe(0);
  });

  it('play returns null when the user has no tower', async () => {
    const user = await userWithoutTower('notower');
    await expect(startPlay(pool, user.id)).resolves.toBeNull();
  });

  it('play returns the latest saved state', async () => {
    const player = await createPlayer(pool);
    await createSnapshotRepository(pool).save(player.towerId, towerAtStep(300));
    const play = await startPlay(pool, Number(player.userId));
    expect(stepOf(play)).toBe(300);
  });

  it('a save with the current token is stored and loads back', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const play = await startPlay(pool, userId);
    const outcome = await savePlayedState(pool, userId, play?.token ?? '', gz(towerAtStep(500)));
    expect(outcome).toBe('saved');
    expect(stepOf(await startPlay(pool, userId))).toBe(500);
  });

  it('a save at a smaller step becomes the latest and survives pruning', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const token = (await startPlay(pool, userId))?.token ?? '';
    for (const step of [1000, 2000, 3000]) {
      expect(await savePlayedState(pool, userId, token, gz(towerAtStep(step)))).toBe('saved');
    }
    expect(await savePlayedState(pool, userId, token, gz(towerAtStep(50)))).toBe('saved');

    expect(stepOf(await startPlay(pool, userId))).toBe(50);
    const kept = await pool.query<{ step: string }>(
      'select step from tower_snapshots where tower_id = $1 order by step',
      [player.towerId],
    );
    expect(kept.rows.map((row) => Number(row.step))).toEqual([50, 2000, 3000]);
  });

  it('a stale token answers stale before the body is read', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const first = await startPlay(pool, userId);
    await startPlay(pool, userId);
    const outcome = await savePlayedState(pool, userId, first?.token ?? '', Buffer.from('nope'));
    expect(outcome).toBe('stale');
  });

  it('a save with an old token answers stale and writes nothing', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    await createSnapshotRepository(pool).save(player.towerId, towerAtStep(300));
    const first = await startPlay(pool, userId);
    await startPlay(pool, userId);
    const outcome = await savePlayedState(pool, userId, first?.token ?? '', gz(towerAtStep(500)));
    expect(outcome).toBe('stale');
    expect(await latestStep(player.towerId)).toBe(300);
  });

  it('a save for a user without a tower answers noTower', async () => {
    const user = await userWithoutTower('notower-save');
    const outcome = await savePlayedState(pool, user.id, 'x', gz(towerAtStep(5)));
    expect(outcome).toBe('noTower');
  });

  async function waitForLockWaiter(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await pool.query(
        `select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%for update%'`,
      );
      if (waiting.rowCount) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The save never waited on the row lock');
  }

  it('a takeover holding the row lock makes a waiting save stale', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const old = await startPlay(pool, userId);
    const taker = await pool.connect();
    try {
      await taker.query('begin');
      await taker.query(`update towers set play_token = 'taken' where id = $1`, [player.towerId]);
      const save = savePlayedState(pool, userId, old?.token ?? '', gz(towerAtStep(500)));
      await waitForLockWaiter();
      await taker.query('commit');
      await expect(save).resolves.toBe('stale');
      expect(await latestStep(player.towerId)).toBeUndefined();
    } finally {
      taker.release();
    }
  });

  it('a save that locks the row before a takeover is stored, and the takeover sees it', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const old = await startPlay(pool, userId);
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select id from towers where id = $1 for update', [player.towerId]);
      const save = savePlayedState(pool, userId, old?.token ?? '', gz(towerAtStep(500)));
      await waitForLockWaiter();
      const takeover = startPlay(pool, userId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await holder.query('commit');
      await expect(save).resolves.toBe('saved');
      const next = await takeover;
      expect(next?.token).not.toBe(old?.token);
      expect(stepOf(next)).toBe(500);
    } finally {
      holder.release();
    }
  });

  it('reset clears the token', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const play = await startPlay(pool, userId);
    await resetTowerOf(pool, userId);
    const outcome = await savePlayedState(pool, userId, play?.token ?? '', gz(towerAtStep(500)));
    expect(outcome).toBe('stale');
  });

  it('invalid gzip, oversize and unparsable states throw InvalidSaveError', async () => {
    const player = await createPlayer(pool);
    const userId = Number(player.userId);
    const token = (await startPlay(pool, userId))?.token ?? '';
    await expect(savePlayedState(pool, userId, token, Buffer.from('nope'))).rejects.toBeInstanceOf(
      InvalidSaveError,
    );
    const huge = gzipSync(Buffer.alloc(33 * 1024 * 1024, 'a'));
    await expect(savePlayedState(pool, userId, token, huge)).rejects.toBeInstanceOf(
      StateTooLargeError,
    );
    const unparsable = gzipSync('{"not":"a tower"}');
    await expect(savePlayedState(pool, userId, token, unparsable)).rejects.toBeInstanceOf(
      InvalidSaveError,
    );
  });

  it('old json snapshots still load', async () => {
    const player = await createPlayer(pool);
    await pool.query(
      'insert into tower_snapshots (tower_id, step, state) values ($1, 42, $2::json)',
      [player.towerId, serializeState(towerAtStep(42))],
    );
    const play = await startPlay(pool, Number(player.userId));
    expect(stepOf(play)).toBe(42);
  });

  describe('routes', () => {
    function play(cookie?: string) {
      return app.inject({
        method: 'POST',
        url: TOWER_PLAY_PATH,
        headers: cookie ? { cookie } : {},
      });
    }

    function put(payload: Buffer, token: string, cookie?: string) {
      return app.inject({
        method: 'PUT',
        url: TOWER_STATE_PATH,
        payload,
        headers: {
          'content-type': 'application/octet-stream',
          [PLAY_TOKEN_HEADER]: token,
          ...(cookie ? { cookie } : {}),
        },
      });
    }

    it('answers 401 without a session', async () => {
      expect((await play()).statusCode).toBe(401);
      expect((await put(gz(towerAtStep(5)), 'x')).statusCode).toBe(401);
    });

    it('answers 404 when the user has no tower', async () => {
      const user = await userWithoutTower('routeless');
      expect((await play(user.cookie)).statusCode).toBe(404);
      expect((await put(gz(towerAtStep(5)), 'x', user.cookie)).statusCode).toBe(404);
    });

    it('answers 204 on a save and 409 for a stale token', async () => {
      const player = await createPlayer(pool);
      const first = await play(player.cookie);
      expect(first.statusCode).toBe(200);
      const firstBody = first.json<PlayResponse>();
      const saved = await put(gz(towerAtStep(500)), firstBody.token, player.cookie);
      expect(saved.statusCode).toBe(204);
      await play(player.cookie);
      const stale = await put(gz(towerAtStep(600)), firstBody.token, player.cookie);
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({
        error: 'Esta torre se abrió en otra pestaña. Recargá para seguir jugando.',
      });
    });

    it('answers 400 for a body that is not a gzipped tower', async () => {
      const player = await createPlayer(pool);
      const body = (await play(player.cookie)).json<PlayResponse>();
      const response = await put(Buffer.from('nope'), body.token, player.cookie);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'El estado guardado no es válido.' });
    });

    it('answers 413 when the state is over 32 MB once unzipped', async () => {
      const player = await createPlayer(pool);
      const body = (await play(player.cookie)).json<PlayResponse>();
      const huge = gzipSync(Buffer.alloc(33 * 1024 * 1024, 'a'));
      const response = await put(huge, body.token, player.cookie);
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: 'El estado guardado es demasiado grande.' });
    });

    it('gzips the play response when the browser accepts gzip', async () => {
      const player = await createPlayer(pool);
      const zipped = await app.inject({
        method: 'POST',
        url: TOWER_PLAY_PATH,
        headers: { cookie: player.cookie, 'accept-encoding': 'gzip, deflate, br' },
      });
      expect(zipped.statusCode).toBe(200);
      expect(zipped.headers['content-encoding']).toBe('gzip');
      expect(zipped.headers['content-type']).toMatch(/^application\/json/);
      const body = JSON.parse(gunzipSync(zipped.rawPayload).toString('utf8')) as PlayResponse;
      expect(stepOf(body)).toBe(0);
      expect(body.token).toBeTruthy();
    });

    it('sends plain JSON when the browser does not accept gzip', async () => {
      const player = await createPlayer(pool);
      const plain = await play(player.cookie);
      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(stepOf(plain.json<PlayResponse>())).toBe(0);
    });

    it('answers 413 over 4 MB', async () => {
      const player = await createPlayer(pool);
      const body = (await play(player.cookie)).json<PlayResponse>();
      const response = await put(randomBytes(MAX_SAVE_BYTES + 1024), body.token, player.cookie);
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: 'El estado guardado es demasiado grande.' });
    });
  });
});
