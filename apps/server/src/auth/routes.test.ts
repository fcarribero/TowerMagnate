import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { startTestDatabase, type TestDatabase } from '../testing/database';
import { SESSION_COOKIE } from './routes';

const PASSWORD = 'torre-alta-1';

describe('auth routes', () => {
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

  function post(url: string, payload?: object, token?: string) {
    return app.inject({
      method: 'POST',
      url,
      payload,
      cookies: token ? { [SESSION_COOKIE]: token } : undefined,
    });
  }

  function register(username: string, password = PASSWORD) {
    return post('/api/auth/register', { username, password });
  }

  function login(username: string, password = PASSWORD) {
    return post('/api/auth/login', { username, password });
  }

  function me(token: string) {
    return app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: token } });
  }

  function sessionCookie(response: LightMyRequestResponse) {
    const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE);
    if (!cookie) {
      throw new Error('Response did not set the session cookie');
    }
    return cookie;
  }

  async function countSessions(token: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'select count(*) from sessions where token = $1',
      [token],
    );
    return Number(result.rows[0]?.count);
  }

  describe('register', () => {
    it('creates the user, hashes the password with argon2id and logs in', async () => {
      const response = await register('ana');

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ user: { id: expect.any(Number), username: 'ana' } });
      const stored = await pool.query<{ password_hash: string }>(
        'select password_hash from users where username = $1',
        ['ana'],
      );
      expect(stored.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
      expect(stored.rows[0]?.password_hash).not.toContain(PASSWORD);
      expect(await countSessions(sessionCookie(response).value)).toBe(1);
    });

    it('answers 409 in Spanish for a duplicate username', async () => {
      await register('beto');
      const response = await register('beto', 'otra-clave-9');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'Ese nombre de usuario ya está en uso.' });
      expect(response.cookies).toEqual([]);
    });

    it('answers 400 in Spanish for invalid usernames and passwords', async () => {
      const tooShort = await register('ab');
      expect(tooShort.statusCode).toBe(400);
      expect(tooShort.json().error).toMatch(/al menos 3 caracteres/);

      const uppercase = await register('Carla');
      expect(uppercase.statusCode).toBe(400);
      expect(uppercase.json().error).toMatch(/minúsculas/);

      const shortPassword = await register('carla', '1234567');
      expect(shortPassword.statusCode).toBe(400);
      expect(shortPassword.json().error).toMatch(/al menos 8 caracteres/);
    });

    it('answers 400 when the body is missing', async () => {
      const response = await post('/api/auth/register');
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/Faltan/);
    });
  });

  describe('session cookie', () => {
    it('is httpOnly, SameSite=Lax, on every path and long lived', async () => {
      const response = await register('dani');
      const header = String(response.headers['set-cookie']);

      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
      expect(header).not.toContain('Secure');
      expect(sessionCookie(response).maxAge).toBe(400 * 24 * 60 * 60);
      expect(sessionCookie(response).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('gets the Secure flag when the app is told to', async () => {
      const secureApp = buildApp({
        version: 'test',
        databaseUrl: database.url,
        secureCookies: true,
      });
      try {
        const response = await secureApp.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { username: 'eva', password: PASSWORD },
        });
        expect(String(response.headers['set-cookie'])).toContain('Secure');
      } finally {
        await secureApp.close();
      }
    });
  });

  describe('login', () => {
    it('opens a new session for the right password', async () => {
      const registered = await register('fede');
      const response = await login('fede');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ user: registered.json().user });
      const token = sessionCookie(response).value;
      expect(token).not.toBe(sessionCookie(registered).value);
      expect((await me(token)).json()).toEqual({ user: registered.json().user });
    });

    it('answers the same 401 for a wrong password and an unknown user', async () => {
      await register('gabi');
      const wrongPassword = await login('gabi', 'no-es-esta');
      const unknownUser = await login('nadie_aqui');

      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual({ error: 'Usuario o contraseña incorrectos.' });
      expect(unknownUser.body).toBe(wrongPassword.body);
      expect(wrongPassword.cookies).toEqual([]);
      expect(unknownUser.cookies).toEqual([]);
    });

    it('answers 400 for credentials that could never be valid', async () => {
      const response = await login('x', 'corta');
      expect(response.statusCode).toBe(400);
    });
  });

  describe('logout', () => {
    it('deletes the session row, clears the cookie and rejects the old cookie', async () => {
      const token = sessionCookie(await register('hugo')).value;
      expect((await me(token)).statusCode).toBe(200);

      const response = await post('/api/auth/logout', undefined, token);

      expect(response.statusCode).toBe(204);
      expect(await countSessions(token)).toBe(0);
      const cleared = sessionCookie(response);
      expect(cleared.value).toBe('');
      expect(cleared.expires?.getTime()).toBeLessThanOrEqual(Date.now());
      const reused = await me(token);
      expect(reused.statusCode).toBe(401);
      expect(reused.json()).toEqual({ error: 'No iniciaste sesión.' });
    });

    it('keeps the other sessions of the same user', async () => {
      const first = sessionCookie(await register('ines')).value;
      const second = sessionCookie(await login('ines')).value;

      await post('/api/auth/logout', undefined, first);

      expect((await me(first)).statusCode).toBe(401);
      expect((await me(second)).statusCode).toBe(200);
    });

    it('answers 204 without a cookie', async () => {
      const response = await post('/api/auth/logout');
      expect(response.statusCode).toBe(204);
    });
  });

  describe('me', () => {
    it('answers 401 without a cookie or with an unknown token', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
      expect((await me('not-a-real-token')).statusCode).toBe(401);
    });
  });
});
