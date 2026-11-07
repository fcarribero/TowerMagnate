import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { startTestDatabase, type TestDatabase } from './testing/database';

const UNREACHABLE_DATABASE_URL = 'postgres://tower:tower@127.0.0.1:1/tower';

describe('health endpoint with a database', () => {
  let database: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = buildApp({ version: '1.2.3', databaseUrl: database.url });
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('answers 200 with the version on /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '1.2.3', database: 'ok' });
  });

  it('answers the same on /api/health for the web proxy', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('answers 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
  });
});

describe('health endpoint without a database', () => {
  it('answers 503 and still reports the version', async () => {
    const app = buildApp({ version: '1.2.3', databaseUrl: UNREACHABLE_DATABASE_URL });
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'degraded',
        version: '1.2.3',
        database: 'unreachable',
      });
    } finally {
      await app.close();
    }
  });
});
