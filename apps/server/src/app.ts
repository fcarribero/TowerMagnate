import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes';
import { createPool, pingDatabase } from './database';
import { registerGateway, type IdentityResolver } from './gateway';
import { checkHealth } from './health';
import { createTowerStore, followConnections, TowerRunner } from './runner';
import { createSnapshotRepository } from './snapshots';
import { sessionIdentityResolver, towerSocketHandlers, Viewports } from './tower-socket';

export interface AppOptions {
  version: string;
  databaseUrl: string;
  secureCookies?: boolean;
  logger?: FastifyServerOptions['logger'];
  resolveSocketIdentity?: IdentityResolver;
  heartbeatIntervalMs?: number;
  helloTimeoutMs?: number;
  runnerTickIntervalMs?: number;
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

  app.register(cookie);
  app.register(authRoutes, { pool, secureCookies: options.secureCookies ?? false });

  for (const path of ['/health', '/api/health']) {
    app.get(path, async (_request, reply) => {
      const report = await checkHealth(options.version, () => pingDatabase(pool));
      return reply.code(report.status === 'ok' ? 200 : 503).send(report);
    });
  }

  const runner = new TowerRunner({
    store: createTowerStore(pool, createSnapshotRepository(pool)),
    onTickError: (towerId, error) => app.log.error({ err: error, towerId }, 'Tower tick failed'),
  });
  const gateway = registerGateway(app, {
    resolveIdentity: options.resolveSocketIdentity ?? sessionIdentityResolver(pool),
    handlers: towerSocketHandlers({ runner, viewports: new Viewports() }),
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    helloTimeoutMs: options.helloTimeoutMs,
  });
  app.decorate('towerRunner', runner);
  followConnections(gateway.registry, runner, app.log);
  const stopRunner = runner.start(options.runnerTickIntervalMs);
  app.addHook('onClose', async () => stopRunner());

  return app;
}
