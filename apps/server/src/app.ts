import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createPool, pingDatabase } from './database';
import { checkHealth } from './health';
import { registerWebStatics } from './webStatics';

export interface AppOptions {
  version: string;
  databaseUrl: string;
  logger?: FastifyServerOptions['logger'];
  /** Folder with the built web client. Without it the server only answers the API. */
  webDir?: string;
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

  if (options.webDir !== undefined) {
    registerWebStatics(app, options.webDir);
  }

  return app;
}
