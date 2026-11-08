import type { AuthUser } from '@tower-magnate/shared';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { findSessionUser } from './sessions';

export const SESSION_COOKIE = 'tm_session';

export async function sessionUserOf(
  pool: pg.Pool,
  request: FastifyRequest,
): Promise<AuthUser | undefined> {
  const token = request.cookies[SESSION_COOKIE];
  return token ? findSessionUser(pool, token) : undefined;
}
