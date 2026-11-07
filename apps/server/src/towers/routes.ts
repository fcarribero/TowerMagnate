import type { AccountResponse, AuthErrorBody, TowerResponse } from '@tower-magnate/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type pg from 'pg';
import { sessionUserOf } from '../auth/session-user';
import type { TowerRunner } from '../runner';
import { createTowerFor, findTowerSummary, resetTowerOf, TowerExistsError } from './repository';

const MESSAGES = {
  notLoggedIn: 'No has iniciado sesión.',
  towerExists: 'Ya tienes una torre.',
  noTower: 'Todavía no tienes una torre.',
  resetNotConfirmed: 'Confirma que quieres demoler la torre y empezar de nuevo.',
};

export interface TowerRoutesOptions {
  pool: pg.Pool;
  runner: TowerRunner;
}

// Expects @fastify/cookie to be registered on the parent instance.
export const towerRoutes: FastifyPluginAsync<TowerRoutesOptions> = async (app, options) => {
  const { pool, runner } = options;

  app.get('/api/account', async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    const tower = (await findTowerSummary(pool, user.id)) ?? null;
    const body: AccountResponse = { user, tower };
    return reply.send(body);
  });

  app.post('/api/tower', async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    try {
      const body: TowerResponse = { tower: await createTowerFor(pool, user.id) };
      return reply.code(201).send(body);
    } catch (error) {
      if (error instanceof TowerExistsError) {
        return sendError(reply, 409, MESSAGES.towerExists);
      }
      throw error;
    }
  });

  app.post('/api/tower/reset', async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    if (!isResetConfirmed(request.body)) {
      return sendError(reply, 400, MESSAGES.resetNotConfirmed);
    }
    const current = await findTowerSummary(pool, user.id);
    if (!current) {
      return sendError(reply, 404, MESSAGES.noTower);
    }
    await runner.pause(String(current.id));
    const tower = await resetTowerOf(pool, user.id);
    if (!tower) {
      return sendError(reply, 404, MESSAGES.noTower);
    }
    const body: TowerResponse = { tower };
    return reply.send(body);
  });
};

function isResetConfirmed(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'confirm' in body && body.confirm === true;
}

function sendError(reply: FastifyReply, statusCode: number, message: string): FastifyReply {
  const body: AuthErrorBody = { error: message };
  return reply.code(statusCode).send(body);
}
