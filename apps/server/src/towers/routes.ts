import {
  PLAY_TOKEN_HEADER,
  TOWER_PLAY_PATH,
  TOWER_STATE_PATH,
  type AccountResponse,
  type AuthErrorBody,
  type PlayResponse,
  type TowerResponse,
} from '@tower-magnate/shared';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { sessionUserOf } from '../auth/session-user';
import {
  InvalidSaveError,
  MAX_SAVE_BYTES,
  savePlayedState,
  startPlay,
  StateTooLargeError,
} from './play';
import { createTowerFor, findTowerSummary, resetTowerOf, TowerExistsError } from './repository';

const gzipAsync = promisify(gzip);

const MESSAGES = {
  notLoggedIn: 'No has iniciado sesión.',
  towerExists: 'Ya tienes una torre.',
  noTower: 'Todavía no tienes una torre.',
  staleToken: 'Esta torre se abrió en otra pestaña. Recargá para seguir jugando.',
  invalidState: 'El estado guardado no es válido.',
  stateTooLarge: 'El estado guardado es demasiado grande.',
  resetNotConfirmed: 'Confirma que quieres demoler la torre y empezar de nuevo.',
};

export interface TowerRoutesOptions {
  pool: pg.Pool;
}

// Expects @fastify/cookie to be registered on the parent instance.
export const towerRoutes: FastifyPluginAsync<TowerRoutesOptions> = async (app, options) => {
  const { pool } = options;

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

  app.post(TOWER_PLAY_PATH, async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    const play = await startPlay(pool, user.id);
    if (!play) {
      return sendError(reply, 404, MESSAGES.noTower);
    }
    const body: PlayResponse = play;
    // The state can be a few MB of JSON; gzip makes it several times smaller.
    if (acceptsGzip(request)) {
      const zipped = await gzipAsync(JSON.stringify(body));
      return reply
        .header('content-encoding', 'gzip')
        .header('vary', 'accept-encoding')
        .type('application/json; charset=utf-8')
        .send(zipped);
    }
    return reply.header('vary', 'accept-encoding').send(body);
  });

  // The save body is raw gzip, so it needs its own parser and a smaller body limit.
  app.register(async (saveScope) => {
    saveScope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_SAVE_BYTES },
      (_request, body, done) => done(null, body),
    );
    saveScope.setErrorHandler((error, _request, reply) => {
      if (isBodyTooLarge(error)) {
        return sendError(reply, 413, MESSAGES.stateTooLarge);
      }
      return reply.send(error);
    });
    saveScope.put(TOWER_STATE_PATH, { bodyLimit: MAX_SAVE_BYTES }, async (request, reply) => {
      const user = await sessionUserOf(pool, request);
      if (!user) {
        return sendError(reply, 401, MESSAGES.notLoggedIn);
      }
      const token = request.headers[PLAY_TOKEN_HEADER];
      if (!Buffer.isBuffer(request.body) || typeof token !== 'string') {
        return sendError(reply, 400, MESSAGES.invalidState);
      }
      try {
        const outcome = await savePlayedState(pool, user.id, token, request.body);
        if (outcome === 'noTower') {
          return sendError(reply, 404, MESSAGES.noTower);
        }
        if (outcome === 'stale') {
          return sendError(reply, 409, MESSAGES.staleToken);
        }
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof StateTooLargeError) {
          return sendError(reply, 413, MESSAGES.stateTooLarge);
        }
        if (error instanceof InvalidSaveError) {
          return sendError(reply, 400, MESSAGES.invalidState);
        }
        throw error;
      }
    });
  });

  app.post('/api/tower/reset', async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    if (!isResetConfirmed(request.body)) {
      return sendError(reply, 400, MESSAGES.resetNotConfirmed);
    }
    const tower = await resetTowerOf(pool, user.id);
    if (!tower) {
      return sendError(reply, 404, MESSAGES.noTower);
    }
    const body: TowerResponse = { tower };
    return reply.send(body);
  });
};

/** True when Accept-Encoding lists gzip (or *) without q=0. */
function acceptsGzip(request: FastifyRequest): boolean {
  const header = request.headers['accept-encoding'];
  if (typeof header !== 'string') {
    return false;
  }
  return header.split(',').some((part) => {
    const [coding = '', ...params] = part.trim().toLowerCase().split(';');
    const refused = params.some((param) => /^\s*q\s*=\s*0(\.0*)?\s*$/.test(param));
    return (coding.trim() === 'gzip' || coding.trim() === '*') && !refused;
  });
}

function isBodyTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
  );
}

function isResetConfirmed(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'confirm' in body && body.confirm === true;
}

function sendError(reply: FastifyReply, statusCode: number, message: string): FastifyReply {
  const body: AuthErrorBody = { error: message };
  return reply.code(statusCode).send(body);
}
