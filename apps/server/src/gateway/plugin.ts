import { TOWER_SOCKET_PATH } from '@tower-magnate/shared';
import websocket, { type WebsocketPluginOptions } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ConnectionRegistry } from './connection-registry';
import { Gateway } from './gateway';
import type { MessageHandlers } from './message-router';
import { CLOSE_CODES, sendError, type GatewaySocket, type SocketIdentity } from './socket';

export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;

/** The socket's user and tower, or a reason to refuse it. */
export type IdentityResult = { identity: SocketIdentity } | { refused: string };

export type IdentityResolver = (request: FastifyRequest) => Promise<IdentityResult>;

export interface GatewayOptions {
  resolveIdentity: IdentityResolver;
  handlers?: MessageHandlers;
  heartbeatIntervalMs?: number;
  helloTimeoutMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    towerConnections: ConnectionRegistry;
  }
  interface FastifyRequest {
    socketIdentity?: IdentityResult;
  }
}

export function registerGateway(app: FastifyInstance, options: GatewayOptions): Gateway {
  const gateway = new Gateway(options.handlers, {
    helloTimeoutMs: options.helloTimeoutMs,
    logger: app.log,
  });
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
    // The lookup runs before the upgrade so no early message is missed by the socket handler.
    scope.addHook('preValidation', async (request) => {
      request.socketIdentity = await resolveSafely(options.resolveIdentity, request);
    });

    // Browsers cannot read an HTTP status from a failed upgrade, so refusals are close codes.
    scope.get(TOWER_SOCKET_PATH, { websocket: true }, (socket, request) => {
      const result = request.socketIdentity ?? { refused: 'Not authenticated' };
      if ('refused' in result) {
        refuse(socket, result.refused);
        return;
      }
      gateway.attach(socket, result.identity);
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

async function resolveSafely(
  resolveIdentity: IdentityResolver,
  request: FastifyRequest,
): Promise<IdentityResult> {
  try {
    return await resolveIdentity(request);
  } catch (error) {
    request.log.error({ err: error }, 'Socket identity lookup failed');
    return { refused: 'Could not check the session' };
  }
}

function refuse(socket: GatewaySocket, reason: string): void {
  sendError(socket, 'NOT_AUTHENTICATED', reason);
  socket.close(CLOSE_CODES.notAuthenticated, 'Not authenticated');
}
