import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes';
import { createPool, pingDatabase } from './database';
import { registerGateway, type IdentityResolver } from './gateway';
import { checkHealth } from './health';
import { towerRoutes } from './towers/routes';
import { createTowerStore, followConnections, TowerRunner } from './runner';
import { registerAuthRateLimit, registerOriginCheck, registerSecurityHeaders } from './security';
import { createSnapshotRepository } from './snapshots';
import {
  DeltaBroadcaster,
  sessionIdentityResolver,
  towerSocketHandlers,
  Viewports,
} from './tower-socket';
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
  resolveSocketIdentity?: IdentityResolver;
  heartbeatIntervalMs?: number;
  helloTimeoutMs?: number;
  runnerTickIntervalMs?: number;
  deltaIntervalMs?: number;
  snapshotIntervalMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    towerRunner: TowerRunner;
  }
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
  app.register(authRoutes, { pool, secureCookies: options.secureCookies ?? false });
  const runner = new TowerRunner({
    store: createTowerStore(pool, createSnapshotRepository(pool)),
    onTickError: (towerId, error) => app.log.error({ err: error, towerId }, 'Tower tick failed'),
    onSaveError: (towerId, error) => app.log.error({ err: error, towerId }, 'Tower save failed'),
  });
  app.decorate('towerRunner', runner);
  app.register(towerRoutes, { pool, runner });

  for (const path of ['/health', '/api/health']) {
    app.get(path, async (_request, reply) => {
      const report = await checkHealth(options.version, () => pingDatabase(pool));
      return reply.code(report.status === 'ok' ? 200 : 503).send(report);
    });
  }

  const viewports = new Viewports();
  const broadcaster = new DeltaBroadcaster({ runner, viewports });
  const gateway = registerGateway(app, {
    resolveIdentity: options.resolveSocketIdentity ?? sessionIdentityResolver(pool),
    handlers: towerSocketHandlers({ runner, viewports, broadcaster }),
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    helloTimeoutMs: options.helloTimeoutMs,
  });
  followConnections(gateway.registry, runner, app.log);
  const stopRunner = runner.start(options.runnerTickIntervalMs);
  const stopDeltas = broadcaster.start(gateway.registry, options.deltaIntervalMs);
  const stopAutosave = runner.startAutosave(options.snapshotIntervalMs);
  app.addHook('preClose', async () => {
    stopDeltas();
    stopAutosave();
    stopRunner();
    await runner.shutdown();
  });

  if (options.webDir !== undefined) {
    registerWebStatics(app, options.webDir);
  }

  return app;
}
