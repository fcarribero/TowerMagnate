import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

const DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';

describe('auth hardening', () => {
  let app: FastifyInstance;

  function start(options: { secureCookies?: boolean; allowedOrigins?: string[] } = {}) {
    app = buildApp({ version: 'test', databaseUrl: DATABASE_URL, ...options });
    return app;
  }

  function post(url: string, headers: Record<string, string> = {}, ip = '10.0.0.1') {
    return app.inject({
      method: 'POST',
      url,
      payload: { username: '', password: '' },
      headers,
      remoteAddress: ip,
    });
  }

  afterEach(async () => {
    await app?.close();
  });

  describe('rate limit', () => {
    it('answers 429 on the 11th login in a minute', async () => {
      start();
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        expect((await post('/api/auth/login')).statusCode).toBe(400);
      }

      const response = await post('/api/auth/login');

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
    });

    it('counts register separately from login', async () => {
      start();
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await post('/api/auth/login');
      }

      expect((await post('/api/auth/register')).statusCode).toBe(400);
    });

    it('counts each IP on its own', async () => {
      start();
      for (let attempt = 1; attempt <= 11; attempt += 1) {
        await post('/api/auth/login', {}, '10.0.0.1');
      }

      expect((await post('/api/auth/login', {}, '10.0.0.2')).statusCode).toBe(400);
    });

    it('limits register after 10 attempts', async () => {
      start();
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await post('/api/auth/register');
      }

      expect((await post('/api/auth/register')).statusCode).toBe(429);
    });
  });

  describe('origin check', () => {
    it('rejects a POST with a foreign Origin', async () => {
      start();

      const response = await post('/api/auth/login', { origin: 'https://evil.example' });

      expect(response.statusCode).toBe(403);
    });

    it('rejects a malformed Origin', async () => {
      start();

      const response = await post('/api/tower', { origin: 'not a url' });

      expect(response.statusCode).toBe(403);
    });

    it('accepts a POST whose Origin matches the Host', async () => {
      start();

      const response = await post('/api/auth/login', {
        origin: 'http://tower.test',
        host: 'tower.test',
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts a POST from a configured web origin that differs from the Host', async () => {
      start({ allowedOrigins: ['http://localhost:4102'] });

      const response = await post('/api/auth/login', {
        origin: 'http://localhost:4102',
        host: 'server:3000',
      });

      expect(response.statusCode).toBe(400);
    });

    it('still rejects a foreign Origin when web origins are configured', async () => {
      start({ allowedOrigins: ['http://localhost:4102'] });

      const response = await post('/api/auth/login', {
        origin: 'https://evil.example',
        host: 'server:3000',
      });

      expect(response.statusCode).toBe(403);
    });

    it('accepts a POST without Origin', async () => {
      start();

      expect((await post('/api/auth/login')).statusCode).toBe(400);
    });

    it('does not check GET requests', async () => {
      start();

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { origin: 'https://evil.example' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('security headers', () => {
    it('sets the headers on every response', async () => {
      start();

      const response = await app.inject({ method: 'GET', url: '/api/auth/me' });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('adds HSTS when cookies are secure', async () => {
      start({ secureCookies: true });

      const response = await app.inject({ method: 'GET', url: '/api/auth/me' });

      expect(response.headers['strict-transport-security']).toContain('max-age=');
    });
  });
});
