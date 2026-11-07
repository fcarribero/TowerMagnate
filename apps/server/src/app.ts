import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes';
import { createPool, pingDatabase } from './database';
import { registerGateway, resolveIdentityFromQuery, type IdentityResolver } from './gateway';
import { checkHealth } from './health';
import { registerWebStatics } from './webStatics';

export interface AppOptions {
  version: string;
  databaseUrl: string;
  secureCookies?: boolean;
  logger?: FastifyServerOptions['logger'];
  /** Folder with the built web client. Without it the server only answers the API. */
  webDir?: string;
  resolveSocketIdentity?: IdentityResolver;
  heartbeatIntervalMs?: number;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const pool = createPool(options.databaseUrl, app.log);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  app.register(cookie);
  app.register(authRoutes, { pool, secureCookies: options.secureCookies ?? false });

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

  if (options.webDir !== undefined) {
    registerWebStatics(app, options.webDir);
  }

  return app;
}
