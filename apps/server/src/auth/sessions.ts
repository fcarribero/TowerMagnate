import { randomBytes } from 'node:crypto';
import type { AuthUser } from '@tower-magnate/shared';
import type pg from 'pg';
import { toAuthUser } from './users';

const TOKEN_BYTES = 32;

export async function createSession(pool: pg.Pool, userId: number): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  await pool.query('insert into sessions (token, user_id) values ($1, $2)', [token, userId]);
  return token;
}

export async function findSessionUser(pool: pg.Pool, token: string): Promise<AuthUser | undefined> {
  const result = await pool.query<{ id: string; username: string }>(
    `select users.id, users.username
     from sessions join users on users.id = sessions.user_id
     where sessions.token = $1`,
    [token],
  );
  const row = result.rows[0];
  return row ? toAuthUser(row) : undefined;
}

export async function deleteSession(pool: pg.Pool, token: string): Promise<void> {
  await pool.query('delete from sessions where token = $1', [token]);
}
