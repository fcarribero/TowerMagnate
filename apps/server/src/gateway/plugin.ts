import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ConnectionRegistry } from './connection-registry';
import { Gateway } from './gateway';
import type { MessageHandlers } from './message-router';
import type { SocketIdentity } from './socket';

export const TOWER_SOCKET_PATH = '/ws/towers/:towerId';

export type IdentityResolver = (
  request: FastifyRequest,
) => SocketIdentity | null | Promise<SocketIdentity | null>;

export interface GatewayOptions {
  resolveIdentity: IdentityResolver;
  handlers?: MessageHandlers;
  heartbeatIntervalMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    towerConnections: ConnectionRegistry;
  }
  interface FastifyRequest {
    socketIdentity?: SocketIdentity;
  }
}

export function registerGateway(app: FastifyInstance, options: GatewayOptions): Gateway {
  const gateway = new Gateway(options.handlers ?? {});
  app.decorate('towerConnections', gateway.registry);

  gateway.registry.on('tower-activated', (identity) => app.log.info(identity, 'Tower activated'));
  gateway.registry.on('tower-deactivated', (identity) =>
    app.log.info(identity, 'Tower deactivated'),
  );

  const stopHeartbeat = gateway.startHeartbeat(options.heartbeatIntervalMs);
  app.addHook('onClose', async () => stopHeartbeat());

  app.register(websocket);
  app.register(async (scope) => {
    scope.addHook('preValidation', async (request, reply) => {
      const identity = await options.resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      request.socketIdentity = identity;
    });

    scope.get(TOWER_SOCKET_PATH, { websocket: true }, (socket, request) => {
      if (request.socketIdentity) {
        gateway.attach(socket, request.socketIdentity);
      }
    });
  });

  return gateway;
}

export function resolveIdentityFromQuery(request: FastifyRequest): SocketIdentity | null {
  const { towerId } = request.params as { towerId?: string };
  const { user } = request.query as { user?: string };
  if (!towerId || !user) {
    return null;
  }
  return { userId: user, towerId };
}
