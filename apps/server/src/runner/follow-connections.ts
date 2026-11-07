import type { FastifyBaseLogger } from 'fastify';
import type { ConnectionRegistry } from '../gateway';
import type { TowerRunner } from './tower-runner';

/** Runs a tower while its owner has a socket open and pauses it when the last one closes. */
export function followConnections(
  registry: ConnectionRegistry,
  runner: TowerRunner,
  log: FastifyBaseLogger,
): void {
  registry.on('tower-activated', ({ towerId }) => {
    runner.resume(towerId).catch((error: unknown) => {
      log.error({ err: error, towerId }, 'Tower failed to resume');
    });
  });
  registry.on('tower-deactivated', ({ towerId }) => {
    runner.pause(towerId).catch((error: unknown) => {
      log.error({ err: error, towerId }, 'Tower failed to pause');
    });
  });
}
