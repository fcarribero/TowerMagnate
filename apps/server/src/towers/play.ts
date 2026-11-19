import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { createTower, deserializeState } from '@tower-magnate/engine';
import type { PlayResponse, TowerState } from '@tower-magnate/shared';
import type pg from 'pg';
import { createSnapshotRepository, saveCompressedSnapshot } from '../snapshots';

export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export const MAX_STATE_BYTES = 32 * 1024 * 1024;

export type SaveOutcome = 'saved' | 'stale' | 'noTower';

const gunzipAsync = promisify(gunzip);

/** The uploaded state is not valid gzip, is too large, or is not a tower state. */
export class InvalidSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaveError';
  }
}

/** The uploaded state unzips to more than MAX_STATE_BYTES. */
export class StateTooLargeError extends InvalidSaveError {
  constructor() {
    super(`The saved state is larger than ${MAX_STATE_BYTES} bytes once unzipped`);
    this.name = 'StateTooLargeError';
  }
}

/**
 * Issues a new play token for the user's tower, which makes every earlier token stale,
 * and returns it with the latest saved state. Null when the user has no tower.
 */
export async function startPlay(pool: pg.Pool, userId: number): Promise<PlayResponse | null> {
  const token = randomBytes(32).toString('base64url');
  const updated = await pool.query<{ id: string; seed: string }>(
    'update towers set play_token = $2 where user_id = $1 returning id, seed',
    [userId, token],
  );
  const tower = updated.rows[0];
  if (!tower) {
    return null;
  }
  const snapshot = await createSnapshotRepository(pool).loadLatest(tower.id);
  return { token, state: snapshot?.state ?? createTower(Number(tower.seed)) };
}

/**
 * Stores the gzipped state when the token is the tower's current one. The token is checked
 * before the body is unzipped, so a stale tab costs one query, and again under the row lock.
 */
export async function savePlayedState(
  pool: pg.Pool,
  userId: number,
  token: string,
  gzipped: Buffer,
): Promise<SaveOutcome> {
  const current = await pool.query<{ play_token: string | null }>(
    'select play_token from towers where user_id = $1',
    [userId],
  );
  const known = current.rows[0];
  if (!known) {
    return 'noTower';
  }
  if (known.play_token === null || known.play_token !== token) {
    return 'stale';
  }
  const state = await parseSave(gzipped);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query<{ id: string; play_token: string | null }>(
      'select id, play_token from towers where user_id = $1 for update',
      [userId],
    );
    const tower = locked.rows[0];
    let outcome: SaveOutcome;
    if (!tower) {
      outcome = 'noTower';
    } else if (tower.play_token === null || tower.play_token !== token) {
      outcome = 'stale';
    } else {
      await saveCompressedSnapshot(client, tower.id, state.step, gzipped);
      outcome = 'saved';
    }
    await client.query('commit');
    return outcome;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function parseSave(gzipped: Buffer): Promise<TowerState> {
  let text: string;
  try {
    text = (await gunzipAsync(gzipped, { maxOutputLength: MAX_STATE_BYTES })).toString('utf8');
  } catch (error) {
    if (isOutputTooLarge(error)) {
      throw new StateTooLargeError();
    }
    throw new InvalidSaveError(error instanceof Error ? error.message : 'Invalid gzip');
  }
  try {
    return deserializeState(text);
  } catch (error) {
    throw new InvalidSaveError(error instanceof Error ? error.message : 'Invalid saved state');
  }
}

/** zlib's maxOutputLength failure: a RangeError with code ERR_BUFFER_TOO_LARGE. */
function isOutputTooLarge(error: unknown): boolean {
  return (
    error instanceof RangeError && (error as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE'
  );
}
