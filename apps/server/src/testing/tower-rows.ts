import type pg from 'pg';
import { SESSION_COOKIE } from '../auth/routes';
import { createSession } from '../auth/sessions';

let rowCount = 0;

async function insertReturningId(pool: pg.Pool, sql: string, values: unknown[]): Promise<string> {
  const result = await pool.query<{ id: string }>(sql, values);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`No id returned by: ${sql}`);
  }
  return row.id;
}

/** Inserts a user and a tower owned by it, returning the tower id. */
export async function createTowerRow(pool: pg.Pool): Promise<string> {
  const player = await createPlayer(pool);
  return player.towerId;
}

export interface TestPlayer {
  userId: string;
  towerId: string;
  /** A `Cookie` header value with a fresh session for the user. */
  cookie: string;
}

/** Inserts a user with a session and a tower. */
export async function createPlayer(pool: pg.Pool): Promise<TestPlayer> {
  rowCount += 1;
  const userId = await insertReturningId(
    pool,
    `insert into users (username, password_hash) values ($1, 'hash') returning id`,
    [`player${rowCount}`],
  );
  const towerId = await insertReturningId(
    pool,
    'insert into towers (user_id, seed) values ($1, 7) returning id',
    [userId],
  );
  const token = await createSession(pool, Number(userId));
  return { userId, towerId, cookie: `${SESSION_COOKIE}=${token}` };
}
