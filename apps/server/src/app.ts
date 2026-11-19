import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes';
import { createPool, pingDatabase } from './database';
import { checkHealth } from './health';
import { towerRoutes } from './towers/routes';
import { registerAuthRateLimit, registerOriginCheck, registerSecurityHeaders } from './security';
import { registerWebStatics } from './webStatics';

export interface AppOptions {
  version: string;
  databaseUrl: string;
  secureCookies?: boolean;
  /** Login and register attempts allowed per IP per minute. */
  authAttemptsPerMinute?: number;
  /** Web origins allowed to send state-changing API requests besides the server's own host. */
  allowedOrigins?: readonly string[];
  logger?: FastifyServerOptions['logger'];
  /** Folder with the built web client. Without it the server only answers the API. */
  webDir?: string;
  /** Dev-only: lets the developer usernames below get the developer menu. Always off in production. */
  debugCommands?: boolean;
  /** Accounts that get the developer menu: infinite money and game speed. Needs debug commands. */
  developerUsernames?: string[];
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const pool = createPool(options.databaseUrl, app.log);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  registerSecurityHeaders(app, { secure: options.secureCookies ?? false });
  registerOriginCheck(app, { allowedOrigins: options.allowedOrigins });
  registerAuthRateLimit(app, { limitPerMinute: options.authAttemptsPerMinute });
  app.register(cookie);
  const developerUsernames = options.debugCommands ? (options.developerUsernames ?? []) : [];
  app.register(authRoutes, {
    pool,
    secureCookies: options.secureCookies ?? false,
    developerUsernames,
  });
  app.register(towerRoutes, { pool });

  for (const path of ['/health', '/api/health']) {
    app.get(path, async (_request, reply) => {
      const report = await checkHealth(options.version, () => pingDatabase(pool));
      return reply.code(report.status === 'ok' ? 200 : 503).send(report);
    });
  }

  if (options.webDir !== undefined) {
    registerWebStatics(app, options.webDir);
  }

  return app;
}
