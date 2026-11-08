import type { FastifyInstance } from 'fastify';
import { MessageRateLimiter } from '../gateway/rate-limiter';

export const MAX_AUTH_ATTEMPTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
const LIMITED_PATHS = new Set(['/api/auth/login', '/api/auth/register']);
const MESSAGE = 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';

export interface AuthRateLimitOptions {
  limitPerMinute?: number;
  now?: () => number;
}

/** Limits login and register attempts per client IP and route. */
export function registerAuthRateLimit(app: FastifyInstance, options: AuthRateLimitOptions): void {
  const limit = options.limitPerMinute ?? MAX_AUTH_ATTEMPTS_PER_MINUTE;
  const now = options.now ?? Date.now;
  const limiters = new Map<string, MessageRateLimiter>();

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (request.method !== 'POST' || !LIMITED_PATHS.has(path)) {
      return;
    }
    const time = now();
    forgetIdleLimiters(limiters, time);
    const key = `${path} ${request.ip}`;
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new MessageRateLimiter(limit, WINDOW_MS);
      limiters.set(key, limiter);
    }
    if (!limiter.tryAccept(time)) {
      return reply.code(429).header('retry-after', '60').send({ error: MESSAGE });
    }
  });
}

function forgetIdleLimiters(limiters: Map<string, MessageRateLimiter>, time: number): void {
  for (const [key, limiter] of limiters) {
    if (limiter.isIdle(time)) {
      limiters.delete(key);
    }
  }
}
