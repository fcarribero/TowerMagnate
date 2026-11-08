import type pg from 'pg';
import { SESSION_COOKIE } from '../auth/routes';
import { findSessionUser } from '../auth/sessions';
import type { IdentityResolver } from '../gateway';

/**
 * Finds the socket's user from the session cookie and the tower that user owns. A `tower`
 * query parameter, when given, must name that same tower.
 */
export function sessionIdentityResolver(pool: pg.Pool): IdentityResolver {
  return async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      return { refused: 'No session cookie' };
    }
    const user = await findSessionUser(pool, token);
    if (!user) {
      return { refused: 'Unknown session' };
    }
    const towerId = await findTowerOfUser(pool, user.id);
    if (towerId === null) {
      return { refused: 'The account has no tower' };
    }
    const { tower: requestedTower } = request.query as { tower?: string };
    if (requestedTower !== undefined && requestedTower !== towerId) {
      return { refused: 'The tower belongs to another account' };
    }
    return { identity: { userId: String(user.id), towerId } };
  };
}

async function findTowerOfUser(pool: pg.Pool, userId: number): Promise<string | null> {
  const result = await pool.query<{ id: string }>('select id from towers where user_id = $1', [
    userId,
  ]);
  return result.rows[0]?.id ?? null;
}
