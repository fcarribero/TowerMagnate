import type pg from 'pg';

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
  rowCount += 1;
  const userId = await insertReturningId(
    pool,
    `insert into users (username, password_hash) values ($1, 'hash') returning id`,
    [`player${rowCount}`],
  );
  return insertReturningId(pool, 'insert into towers (user_id, seed) values ($1, 7) returning id', [
    userId,
  ]);
}
