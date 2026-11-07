import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createPool, pingDatabase } from './database';
import { registerGateway, resolveIdentityFromQuery, type IdentityResolver } from './gateway';
import { checkHealth } from './health';

export interface AppOptions {
  version: string;
  databaseUrl: string;
  logger?: FastifyServerOptions['logger'];
  resolveSocketIdentity?: IdentityResolver;
  heartbeatIntervalMs?: number;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const pool = createPool(options.databaseUrl, app.log);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  for (const path of ['/health', '/api/health']) {
    app.get(path, async (_request, reply) => {
      const report = await checkHealth(options.version, () => pingDatabase(pool));
      return reply.code(report.status === 'ok' ? 200 : 503).send(report);
    });
  }

  registerGateway(app, {
    resolveIdentity: options.resolveSocketIdentity ?? resolveIdentityFromQuery,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
  });

  return app;
}
