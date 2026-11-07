import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

const databaseUrl = 'postgres://tower:tower@localhost:5432/tower';

describe('readConfig', () => {
  it('reads the port and database url', () => {
    expect(readConfig({ PORT: '4131', DATABASE_URL: databaseUrl })).toEqual({
      port: 4131,
      databaseUrl,
    });
  });

  it('defaults the port to 3000', () => {
    expect(readConfig({ DATABASE_URL: databaseUrl }).port).toBe(3000);
  });

  it('requires a database url', () => {
    expect(() => readConfig({ PORT: '3000' })).toThrow('DATABASE_URL is not set');
  });

  it('rejects a port that is not a valid number', () => {
    expect(() => readConfig({ PORT: 'abc', DATABASE_URL: databaseUrl })).toThrow('PORT');
    expect(() => readConfig({ PORT: '70000', DATABASE_URL: databaseUrl })).toThrow('PORT');
  });
});
