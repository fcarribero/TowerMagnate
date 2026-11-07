import websocket, { type WebsocketPluginOptions } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ConnectionRegistry } from './connection-registry';
import { Gateway } from './gateway';
import type { MessageHandlers } from './message-router';
import type { SocketIdentity } from './socket';

export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;

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
  const gateway = new Gateway(options.handlers ?? {}, { logger: app.log });
  app.decorate('towerConnections', gateway.registry);

  gateway.registry.on('tower-activated', (identity) => app.log.info(identity, 'Tower activated'));
  gateway.registry.on('tower-deactivated', (identity) =>
    app.log.info(identity, 'Tower deactivated'),
  );

  const stopHeartbeat = gateway.startHeartbeat(options.heartbeatIntervalMs);
  app.addHook('onClose', async () => stopHeartbeat());

  app.register(websocket, {
    options: { maxPayload: MAX_CLIENT_MESSAGE_BYTES },
    errorHandler: handleSocketError,
  });
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

// ws already sent a close frame with the right code (1009 for an oversized message)
// when it reports a protocol error, so only sockets still open are cut off here.
const handleSocketError: NonNullable<WebsocketPluginOptions['errorHandler']> = (
  error,
  socket,
  request,
) => {
  request.log.warn({ ...request.socketIdentity, error }, 'Socket error');
  if (socket.readyState === socket.OPEN) {
    socket.terminate();
  }
};

export function resolveIdentityFromQuery(request: FastifyRequest): SocketIdentity | null {
  const { towerId } = request.params as { towerId?: string };
  const { user } = request.query as { user?: string };
  if (!towerId || !user) {
    return null;
  }
  return { userId: user, towerId };
}
