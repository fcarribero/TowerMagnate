import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrateOptions {
  directory?: string;
  onApplied?: (name: string) => void;
}

export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations', import.meta.url));

// Any constant works, as long as every server instance uses the same one.
const MIGRATION_LOCK_ID = 4_404_001;

const CREATE_MIGRATIONS_TABLE = `
  create table if not exists schema_migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`;

export async function loadMigrations(directory = MIGRATIONS_DIRECTORY): Promise<Migration[]> {
  const fileNames = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const migrations: Migration[] = [];
  for (const fileName of fileNames) {
    const sql = await readFile(join(directory, fileName), 'utf8');
    migrations.push({ name: fileName.replace(/\.sql$/, ''), sql, checksum: checksumOf(sql) });
  }
  return migrations;
}

export async function runMigrations(
  pool: pg.Pool,
  options: MigrateOptions = {},
): Promise<string[]> {
  const migrations = await loadMigrations(options.directory);
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      await client.query(CREATE_MIGRATIONS_TABLE);
      const applied = await readAppliedChecksums(client);
      const pending = migrations.filter((migration) => !applied.has(migration.name));
      assertAppliedUnchanged(migrations, applied);
      for (const migration of pending) {
        await applyMigration(client, migration);
        options.onApplied?.(migration.name);
      }
      return pending.map((migration) => migration.name);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

async function readAppliedChecksums(client: pg.PoolClient): Promise<Map<string, string>> {
  const result = await client.query<{ name: string; checksum: string }>(
    'select name, checksum from schema_migrations',
  );
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

function assertAppliedUnchanged(migrations: Migration[], applied: Map<string, string>): void {
  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.name);
    if (appliedChecksum !== undefined && appliedChecksum !== migration.checksum) {
      throw new Error(
        `Migration ${migration.name} was changed after it was applied. Add a new migration instead.`,
      );
    }
  }
}

async function applyMigration(client: pg.PoolClient, migration: Migration): Promise<void> {
  await client.query('begin');
  try {
    await client.query(migration.sql);
    await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
      migration.name,
      migration.checksum,
    ]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function migrateDatabase(
  databaseUrl: string,
  options: MigrateOptions = {},
): Promise<string[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    return await runMigrations(pool, options);
  } finally {
    await pool.end();
  }
}
