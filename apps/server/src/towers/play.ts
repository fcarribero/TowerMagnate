import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createTower, deserializeState } from '@tower-magnate/engine';
import type { PlayResponse, TowerState } from '@tower-magnate/shared';
import type pg from 'pg';
import { createSnapshotRepository, saveCompressedSnapshot } from '../snapshots';

export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export const MAX_STATE_BYTES = 32 * 1024 * 1024;

export type SaveOutcome = 'saved' | 'stale' | 'noTower';

/** The uploaded state is not valid gzip, is too large, or is not a tower state. */
export class InvalidSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaveError';
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

/** Stores the gzipped state when the token is the tower's current one. */
export async function savePlayedState(
  pool: pg.Pool,
  userId: number,
  token: string,
  gzipped: Buffer,
): Promise<SaveOutcome> {
  const state = parseSave(gzipped);
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

function parseSave(gzipped: Buffer): TowerState {
  try {
    const text = gunzipSync(gzipped, { maxOutputLength: MAX_STATE_BYTES }).toString('utf8');
    return deserializeState(text);
  } catch (error) {
    throw new InvalidSaveError(error instanceof Error ? error.message : 'Invalid saved state');
  }
}
