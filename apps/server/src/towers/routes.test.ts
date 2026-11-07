import { STEPS_PER_DAY } from '@tower-magnate/engine';
import { STARTING_MONEY, type TowerSummary } from '@tower-magnate/shared';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { SESSION_COOKIE } from '../auth/routes';
import { createSnapshotRepository } from '../snapshots';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { towerAtStep } from '../testing/towers';

const PASSWORD = 'torre-alta-1';

const FIRST_MONDAY = { year: 1, month: 1, day: 1, weekday: 0, hour: 0, minute: 0 };

describe('account and tower routes', () => {
  let database: TestDatabase;
  let pool: pg.Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = await startTestDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
    app = buildApp({ version: 'test', databaseUrl: database.url });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await database?.stop();
  });

  async function registerSession(username: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password: PASSWORD },
    });
    const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE);
    if (!cookie) {
      throw new Error('Register did not set the session cookie');
    }
    return cookie.value;
  }

  function account(token?: string) {
    return app.inject({ method: 'GET', url: '/api/account', cookies: cookiesFor(token) });
  }

  function createTower(token?: string) {
    return app.inject({ method: 'POST', url: '/api/tower', cookies: cookiesFor(token) });
  }

  function resetTower(token?: string, payload?: object) {
    return app.inject({
      method: 'POST',
      url: '/api/tower/reset',
      payload,
      cookies: cookiesFor(token),
    });
  }

  function cookiesFor(token?: string) {
    return token ? { [SESSION_COOKIE]: token } : undefined;
  }

  async function storedTower(towerId: number) {
    const tower = await pool.query<{ seed: string }>('select seed from towers where id = $1', [
      towerId,
    ]);
    const snapshots = await pool.query<{ step: string }>(
      'select step from tower_snapshots where tower_id = $1 order by step',
      [towerId],
    );
    return {
      seed: tower.rows[0]?.seed,
      steps: snapshots.rows.map((row) => Number(row.step)),
    };
  }

  describe('without a session', () => {
    it.each([
      ['GET /api/account', () => account()],
      ['POST /api/tower', () => createTower()],
      ['POST /api/tower/reset', () => resetTower(undefined, { confirm: true })],
    ])('%s answers 401 in Spanish', async (_name, call) => {
      const response = await call();

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'No has iniciado sesión.' });
    });

    it('rejects a session token that does not exist', async () => {
      const response = await account('not-a-real-token');

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/account', () => {
    it('returns the user and no tower before one is created', async () => {
      const token = await registerSession('carla');

      const response = await account(token);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: { id: expect.any(Number), username: 'carla' },
        tower: null,
      });
    });

    it('summarises the latest saved snapshot of the tower', async () => {
      const token = await registerSession('dario');
      const created: TowerSummary = (await createTower(token)).json().tower;
      const later = { ...towerAtStep(STEPS_PER_DAY * 3 + 600), money: 1_234 };
      await createSnapshotRepository(pool).save(String(created.id), later);

      const response = await account(token);

      expect(response.json().tower).toMatchObject({
        id: created.id,
        step: later.step,
        money: 1_234,
        date: { year: 1, month: 1, day: 4, weekday: 3 },
      });
    });
  });

  describe('POST /api/tower', () => {
    it('creates a tower at step 0 on Monday 1 January of year 1', async () => {
      const token = await registerSession('elena');

      const response = await createTower(token);

      expect(response.statusCode).toBe(201);
      const tower: TowerSummary = response.json().tower;
      expect(tower).toEqual({
        id: expect.any(Number),
        step: 0,
        date: FIRST_MONDAY,
        money: STARTING_MONEY,
        unitCount: 0,
        createdAt: expect.any(String),
      });
      expect((await storedTower(tower.id)).steps).toEqual([0]);
      expect((await account(token)).json().tower).toEqual(tower);
    });

    it('allows only one tower per account', async () => {
      const token = await registerSession('fede');
      await createTower(token);

      const response = await createTower(token);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'Ya tienes una torre.' });
      const count = await pool.query<{ count: string }>(
        'select count(*) from towers join users on users.id = towers.user_id where username = $1',
        ['fede'],
      );
      expect(Number(count.rows[0]?.count)).toBe(1);
    });
  });

  describe('POST /api/tower/reset', () => {
    it('needs the confirmation flag', async () => {
      const token = await registerSession('gabi');
      await createTower(token);

      for (const payload of [undefined, {}, { confirm: false }, { confirm: 'true' }]) {
        const response = await resetTower(token, payload);

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toMatch(/^Confirma/);
      }
    });

    it('answers 404 when the account has no tower', async () => {
      const token = await registerSession('hugo');

      const response = await resetTower(token, { confirm: true });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Todavía no tienes una torre.' });
    });

    it('deletes the snapshots and restarts on Monday 1 January of year 1 with a new seed', async () => {
      const token = await registerSession('ines');
      const created: TowerSummary = (await createTower(token)).json().tower;
      const before = await storedTower(created.id);
      const snapshots = createSnapshotRepository(pool);
      await snapshots.save(String(created.id), towerAtStep(5_000));
      await snapshots.save(String(created.id), towerAtStep(9_000));

      const response = await resetTower(token, { confirm: true });

      expect(response.statusCode).toBe(200);
      const tower: TowerSummary = response.json().tower;
      expect(tower).toMatchObject({ id: created.id, step: 0, date: FIRST_MONDAY, unitCount: 0 });
      const after = await storedTower(created.id);
      expect(after.steps).toEqual([0]);
      expect(after.seed).not.toBe(before.seed);
      expect((await account(token)).json().tower).toMatchObject({ step: 0, date: FIRST_MONDAY });
    });

    it('stops a live tower so it does not overwrite the reset', async () => {
      const token = await registerSession('lara');
      const created: TowerSummary = (await createTower(token)).json().tower;
      const towerId = String(created.id);
      await app.towerRunner.resume(towerId);

      await resetTower(token, { confirm: true });

      expect(app.towerRunner.isRunning(towerId)).toBe(false);
      expect((await storedTower(created.id)).steps).toEqual([0]);
    });

    it('leaves other accounts untouched', async () => {
      const resetter = await registerSession('juan');
      const bystander = await registerSession('karen');
      await createTower(resetter);
      const other: TowerSummary = (await createTower(bystander)).json().tower;
      await createSnapshotRepository(pool).save(String(other.id), towerAtStep(7_200));

      await resetTower(resetter, { confirm: true });

      expect((await storedTower(other.id)).steps).toEqual([0, 7_200]);
    });
  });
});
