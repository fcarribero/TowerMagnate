import type { FastifyInstance } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MESSAGE = 'Origen no permitido.';

export interface OriginCheckOptions {
  /** Web origins allowed besides the server's own host, for example the Vite dev server. */
  allowedOrigins?: readonly string[];
}

/**
 * Rejects state-changing API requests sent from another site. Browsers always
 * send Origin on cross-origin POSTs; requests without it come from non-browser clients.
 */
export function registerOriginCheck(app: FastifyInstance, options: OriginCheckOptions = {}): void {
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) {
      return;
    }
    const origin = request.headers.origin;
    if (
      origin !== undefined &&
      !allowedOrigins.has(origin) &&
      !isSameHost(origin, request.headers.host)
    ) {
      return reply.code(403).send({ error: MESSAGE });
    }
  });
}

function isSameHost(origin: string, host: string | undefined): boolean {
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}
