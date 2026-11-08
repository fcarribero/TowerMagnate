import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';

const DEFAULT_CONNECTION_TIMEOUT_MS = 3_000;

function connectionTimeoutMs(): number {
  return Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) || DEFAULT_CONNECTION_TIMEOUT_MS;
}

export function createPool(databaseUrl: string, logger: FastifyBaseLogger): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: connectionTimeoutMs(),
  });
  // An idle client can lose its connection at any time, for example when postgres restarts.
  // Without a listener the pool error would crash the process.
  pool.on('error', (error) => {
    logger.error({ err: error }, 'Idle database client failed');
  });
  return pool;
}

export async function pingDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('select 1');
}
