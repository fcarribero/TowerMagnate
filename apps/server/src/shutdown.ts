import type { FastifyInstance } from 'fastify';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export function installShutdownHandlers(app: FastifyInstance): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => void shutDown(app, signal));
  }
}

export async function shutDown(app: FastifyInstance, signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down');
  try {
    await app.close();
    app.log.info('Server stopped');
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, 'Shutdown failed');
    process.exitCode = 1;
  }
}
