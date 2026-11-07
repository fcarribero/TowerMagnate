import type { AuthUser } from '@tower-magnate/shared';
import pg from 'pg';

const UNIQUE_VIOLATION = '23505';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username ${username} is already taken`);
    this.name = 'UsernameTakenError';
  }
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

export async function insertUser(
  pool: pg.Pool,
  username: string,
  passwordHash: string,
): Promise<AuthUser> {
  try {
    const result = await pool.query<UserRow>(
      'insert into users (username, password_hash) values ($1, $2) returning id, username',
      [username, passwordHash],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Inserting a user returned no row');
    }
    return toAuthUser(row);
  } catch (error) {
    if (error instanceof pg.DatabaseError && error.code === UNIQUE_VIOLATION) {
      throw new UsernameTakenError(username);
    }
    throw error;
  }
}

export async function findUserByUsername(
  pool: pg.Pool,
  username: string,
): Promise<StoredUser | undefined> {
  const result = await pool.query<UserRow>(
    'select id, username, password_hash from users where username = $1',
    [username],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  return { ...toAuthUser(row), passwordHash: row.password_hash };
}

export function toAuthUser(row: Pick<UserRow, 'id' | 'username'>): AuthUser {
  return { id: Number(row.id), username: row.username };
}
