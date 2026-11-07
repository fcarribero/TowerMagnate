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
    });
  });

  it('uses defaults for host, port and log level', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl })).toEqual({
      host: '0.0.0.0',
      port: 3000,
      databaseUrl,
      logLevel: 'info',
    });
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
});
