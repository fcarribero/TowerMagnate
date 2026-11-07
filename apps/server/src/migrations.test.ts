import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDatabase, runMigrations } from './migrations';
import { startTestDatabase, type TestDatabase } from './testing/database';

describe('initial schema', () => {
  let database: TestDatabase;
  let pool: pg.Pool;

  beforeAll(async () => {
    database = await startTestDatabase();
    pool = new pg.Pool({ connectionString: database.url });
  });

  afterAll(async () => {
    await pool?.end();
    await database?.stop();
  });

  it('applies every migration once and nothing on the second run', async () => {
    const all = (await loadMigrations()).map((migration) => migration.name);
    expect(all).toContain('0001_initial_schema');

    expect(await runMigrations(pool)).toEqual(all);
    expect(await runMigrations(pool)).toEqual([]);
  });

  it('creates the tables with the described columns', async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name <> 'schema_migrations'
       order by table_name, ordinal_position`,
    );
    const columnsByTable: Record<string, string[]> = {};
    for (const row of result.rows) {
      (columnsByTable[row.table_name] ??= []).push(row.column_name);
    }
    expect(columnsByTable).toEqual({
      users: ['id', 'username', 'password_hash', 'created_at'],
      sessions: ['token', 'user_id', 'created_at'],
      towers: ['id', 'user_id', 'seed', 'created_at'],
      tower_snapshots: ['tower_id', 'step', 'state', 'saved_at'],
    });
  });

  it('stores snapshot state as lz4-compressed json', async () => {
    const result = await pool.query<{ data_type: string; compression: string }>(
      `select format_type(atttypid, atttypmod) as data_type, attcompression as compression
       from pg_attribute where attrelid = 'tower_snapshots'::regclass and attname = 'state'`,
    );
    expect(result.rows[0]).toEqual({ data_type: 'json', compression: 'l' });
  });

  it('deletes sessions, towers and snapshots with their user', async () => {
    const userId = await insertUser(pool, 'ana');
    const towerId = await insertTower(pool, userId);
    await pool.query(`insert into sessions (token, user_id) values ('token-ana', $1)`, [userId]);
    await pool.query(`insert into tower_snapshots (tower_id, step, state) values ($1, 0, '{}')`, [
      towerId,
    ]);

    await pool.query('delete from users where id = $1', [userId]);

    expect(await countRows(pool, 'sessions')).toBe(0);
    expect(await countRows(pool, 'towers')).toBe(0);
    expect(await countRows(pool, 'tower_snapshots')).toBe(0);
  });

  it('refuses a second user with the same username', async () => {
    await insertUser(pool, 'beto');
    await expect(insertUser(pool, 'beto')).rejects.toThrow(/users_username_key/);
  });

  it('refuses a second tower for the same user', async () => {
    const userId = await insertUser(pool, 'carla');
    await insertTower(pool, userId);
    await expect(insertTower(pool, userId)).rejects.toThrow(/towers_user_id_key/);
  });

  it('refuses a session for a user that does not exist', async () => {
    await expect(
      pool.query(`insert into sessions (token, user_id) values ('orphan', -1)`),
    ).rejects.toThrow(/sessions_user_id_fkey/);
  });
});

describe('migration runner', () => {
  let database: TestDatabase;
  let directory: string;

  beforeEach(async () => {
    database = await startTestDatabase();
    directory = await mkdtemp(join(tmpdir(), 'tm-migrations-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    await database?.stop();
  });

  it('applies files in name order and reports each one', async () => {
    await writeFile(join(directory, '0002_add_column.sql'), 'alter table things add column b int;');
    await writeFile(join(directory, '0001_create.sql'), 'create table things (a int);');
    await writeFile(join(directory, 'notes.txt'), 'not a migration');
    const reported: string[] = [];

    const applied = await migrateDatabase(database.url, {
      directory,
      onApplied: (name) => reported.push(name),
    });

    expect(applied).toEqual(['0001_create', '0002_add_column']);
    expect(reported).toEqual(applied);
  });

  it('applies only the migrations added since the last run', async () => {
    await writeFile(join(directory, '0001_create.sql'), 'create table things (a int);');
    await migrateDatabase(database.url, { directory });
    await writeFile(join(directory, '0002_add_column.sql'), 'alter table things add column b int;');

    expect(await migrateDatabase(database.url, { directory })).toEqual(['0002_add_column']);
  });

  it('rolls back a failing migration and leaves it pending', async () => {
    await writeFile(
      join(directory, '0001_broken.sql'),
      'create table half_done (a int); select * from missing_table;',
    );

    await expect(migrateDatabase(database.url, { directory })).rejects.toThrow(
      /Migration 0001_broken failed/,
    );

    const pool = new pg.Pool({ connectionString: database.url });
    try {
      const tables = await pool.query(`select to_regclass('half_done') as name`);
      expect(tables.rows[0].name).toBeNull();
      expect(await countRows(pool, 'schema_migrations')).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('refuses to run when an applied migration was edited', async () => {
    await writeFile(join(directory, '0001_create.sql'), 'create table things (a int);');
    await migrateDatabase(database.url, { directory });
    await writeFile(join(directory, '0001_create.sql'), 'create table things (a bigint);');

    await expect(migrateDatabase(database.url, { directory })).rejects.toThrow(
      /0001_create was changed/,
    );
  });

  it('applies each migration once when two servers start together', async () => {
    await writeFile(join(directory, '0001_create.sql'), 'create table things (a int);');

    const results = await Promise.all([
      migrateDatabase(database.url, { directory }),
      migrateDatabase(database.url, { directory }),
    ]);

    expect(results.flat()).toEqual(['0001_create']);
  });
});

describe('startTestDatabase', () => {
  it('can hand out a database that is already migrated', async () => {
    const database = await startTestDatabase({ migrate: true });
    const pool = new pg.Pool({ connectionString: database.url });
    try {
      expect(await countRows(pool, 'users')).toBe(0);
    } finally {
      await pool.end();
      await database.stop();
    }
  });
});

async function insertUser(pool: pg.Pool, username: string): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `insert into users (username, password_hash) values ($1, 'hash') returning id`,
    [username],
  );
  return Number(result.rows[0]?.id);
}

async function insertTower(pool: pg.Pool, userId: number): Promise<number> {
  const result = await pool.query<{ id: string }>(
    'insert into towers (user_id, seed) values ($1, 42) returning id',
    [userId],
  );
  return Number(result.rows[0]?.id);
}

async function countRows(pool: pg.Pool, table: string): Promise<number> {
  const result = await pool.query<{ count: string }>(`select count(*) from ${table}`);
  return Number(result.rows[0]?.count);
}
