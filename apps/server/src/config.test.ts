import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

const databaseUrl = 'postgres://tower:tower@localhost:5432/tower';

describe('readConfig', () => {
  it('reads every setting from the environment', () => {
    const env = { HOST: '127.0.0.1', PORT: '4131', DATABASE_URL: databaseUrl, LOG_LEVEL: 'debug' };
    expect(readConfig(env)).toEqual({
      host: '127.0.0.1',
      port: 4131,
      databaseUrl,
      logLevel: 'debug',
      migrateOnStart: true,
      secureCookies: false,
      allowedOrigins: ['http://localhost:5173'],
    });
  });

  it('uses defaults for host, port and log level', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl })).toEqual({
      host: '0.0.0.0',
      port: 3000,
      databaseUrl,
      logLevel: 'info',
      migrateOnStart: true,
      secureCookies: false,
      allowedOrigins: ['http://localhost:5173'],
    });
  });

  it('reads the web build folder when it is set', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl, WEB_DIR: '/app/web' }).webDir).toBe('/app/web');
    expect(readConfig({ DATABASE_URL: databaseUrl, WEB_DIR: '' }).webDir).toBeUndefined();
  });

  it('accepts port 0 so the system picks a free port', () => {
    expect(readConfig({ PORT: '0', DATABASE_URL: databaseUrl }).port).toBe(0);
  });

  it('requires a database url', () => {
    expect(() => readConfig({ PORT: '3000' })).toThrow('DATABASE_URL is not set');
  });

  it('rejects a port that is not a valid number', () => {
    expect(() => readConfig({ PORT: 'abc', DATABASE_URL: databaseUrl })).toThrow('PORT');
    expect(() => readConfig({ PORT: '70000', DATABASE_URL: databaseUrl })).toThrow('PORT');
  });

  it('rejects an unknown log level', () => {
    expect(() => readConfig({ LOG_LEVEL: 'loud', DATABASE_URL: databaseUrl })).toThrow('LOG_LEVEL');
  });

  it('migrates on start outside production unless told otherwise', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl }).migrateOnStart).toBe(true);
    expect(readConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production' }).migrateOnStart).toBe(
      false,
    );
    expect(
      readConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production', MIGRATE_ON_START: 'true' })
        .migrateOnStart,
    ).toBe(true);
    expect(
      readConfig({ DATABASE_URL: databaseUrl, MIGRATE_ON_START: 'false' }).migrateOnStart,
    ).toBe(false);
  });

  it('rejects a MIGRATE_ON_START that is not a boolean', () => {
    expect(() => readConfig({ DATABASE_URL: databaseUrl, MIGRATE_ON_START: 'yes' })).toThrow(
      'MIGRATE_ON_START',
    );
  });

  it('marks cookies secure only in production unless told otherwise', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl }).secureCookies).toBe(false);
    expect(readConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production' }).secureCookies).toBe(
      true,
    );
    expect(
      readConfig({ DATABASE_URL: databaseUrl, NODE_ENV: 'production', SECURE_COOKIES: 'false' })
        .secureCookies,
    ).toBe(false);
    expect(() => readConfig({ DATABASE_URL: databaseUrl, SECURE_COOKIES: 'on' })).toThrow(
      'SECURE_COOKIES',
    );
  });

  it('reads the allowed web origins as a comma separated list', () => {
    const origins = (env: Record<string, string>) =>
      readConfig({ DATABASE_URL: databaseUrl, ...env }).allowedOrigins;

    expect(origins({ ALLOWED_ORIGINS: 'http://localhost:4102, https://tower.example' })).toEqual([
      'http://localhost:4102',
      'https://tower.example',
    ]);
    expect(origins({ NODE_ENV: 'production' })).toEqual([]);
  });
});
