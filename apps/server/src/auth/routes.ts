import { credentialsSchema, type AuthErrorBody, type Credentials } from '@tower-magnate/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { hashPassword, verifyAgainstUnknownUser, verifyPassword } from './passwords';
import { SESSION_COOKIE, sessionUserOf } from './session-user';
import { createSession, deleteSession } from './sessions';
import { findUserByUsername, insertUser, UsernameTakenError } from './users';

export { SESSION_COOKIE };
// Browsers cap cookie lifetime at 400 days. The session row itself never expires.
const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const MESSAGES = {
  usernameTaken: 'Ese nombre de usuario ya está en uso.',
  wrongCredentials: 'Usuario o contraseña incorrectos.',
  notLoggedIn: 'No iniciaste sesión.',
};

export interface AuthRoutesOptions {
  pool: pg.Pool;
  secureCookies: boolean;
}

// Expects @fastify/cookie to be registered on the parent instance.
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const { pool, secureCookies } = options;

  async function startSession(reply: FastifyReply, userId: number): Promise<void> {
    const token = await createSession(pool, userId);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }

  app.post('/api/auth/register', async (request, reply) => {
    const credentials = parseCredentials(request, reply);
    if (!credentials) {
      return reply;
    }
    const passwordHash = await hashPassword(credentials.password);
    try {
      const user = await insertUser(pool, credentials.username, passwordHash);
      await startSession(reply, user.id);
      return reply.code(201).send({ user });
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        return sendError(reply, 409, MESSAGES.usernameTaken);
      }
      throw error;
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const credentials = parseCredentials(request, reply);
    if (!credentials) {
      return reply;
    }
    const stored = await findUserByUsername(pool, credentials.username);
    const passwordMatches = stored
      ? await verifyPassword(stored.passwordHash, credentials.password)
      : await verifyAgainstUnknownUser(credentials.password);
    if (!stored || !passwordMatches) {
      return sendError(reply, 401, MESSAGES.wrongCredentials);
    }
    await startSession(reply, stored.id);
    return reply.send({ user: { id: stored.id, username: stored.username } });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await deleteSession(pool, token);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = await sessionUserOf(pool, request);
    if (!user) {
      return sendError(reply, 401, MESSAGES.notLoggedIn);
    }
    return reply.send({ user });
  });
};

function parseCredentials(request: FastifyRequest, reply: FastifyReply): Credentials | undefined {
  const result = credentialsSchema.safeParse(request.body);
  if (result.success) {
    return result.data;
  }
  sendError(reply, 400, result.error.issues[0]?.message ?? MESSAGES.wrongCredentials);
  return undefined;
}

function sendError(reply: FastifyReply, statusCode: number, message: string): FastifyReply {
  const body: AuthErrorBody = { error: message };
  return reply.code(statusCode).send(body);
}
