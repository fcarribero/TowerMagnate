import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

const UNREACHABLE_DATABASE_URL = 'postgres://tower:tower@127.0.0.1:1/tower';
const HTML = { accept: 'text/html,application/xhtml+xml' };

describe('web statics', () => {
  let webDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), 'tm-web-'));
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Tower Magnate</title>');
    writeFileSync(join(webDir, 'assets', 'main-a1b2c3.js'), 'console.log(1);');
    writeFileSync(join(webDir, 'favicon.svg'), '<svg/>');
    app = buildApp({ version: '1.2.3', databaseUrl: UNREACHABLE_DATABASE_URL, webDir });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(webDir, { recursive: true, force: true });
  });

  it('serves the game page at the root and asks the browser to revalidate it', async () => {
    const response = await app.inject({ method: 'GET', url: '/', headers: HTML });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Tower Magnate');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('caches hashed assets for a year', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/main-a1b2c3.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates files outside the hashed assets folder', async () => {
    const response = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('answers page routes with the game page', async () => {
    const response = await app.inject({ method: 'GET', url: '/torre/3', headers: HTML });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Tower Magnate');
  });

  it('keeps 404 for missing files and unknown api routes', async () => {
    const missingAsset = await app.inject({ method: 'GET', url: '/assets/gone.js', headers: HTML });
    const missingApi = await app.inject({ method: 'GET', url: '/api/nope', headers: HTML });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingApi.statusCode).toBe(404);
  });

  it('still answers the api', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.json()).toMatchObject({ version: '1.2.3' });
  });
});

describe('web statics without a build', () => {
  it('refuses to start when the folder has no index.html', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'tm-web-empty-'));
    try {
      expect(() =>
        buildApp({ version: '1.2.3', databaseUrl: UNREACHABLE_DATABASE_URL, webDir: emptyDir }),
      ).toThrow(/index\.html is missing/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
