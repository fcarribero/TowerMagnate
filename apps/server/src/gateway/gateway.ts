import { ConnectionRegistry } from './connection-registry';
import { Heartbeat } from './heartbeat';
import { createMessageRouter, type MessageHandlers } from './message-router';
import { MAX_MESSAGES_PER_SECOND, MessageRateLimiter } from './rate-limiter';
import { sendErrorFrame, type GatewaySocket, type SocketIdentity } from './socket';

export interface GatewayLogger {
  warn(details: object, message: string): void;
}

export interface GatewayRuntimeOptions {
  now?: () => number;
  logger?: GatewayLogger;
}

export class Gateway {
  readonly registry = new ConnectionRegistry();
  private readonly heartbeat = new Heartbeat((socket) => this.registry.remove(socket));
  private readonly routeMessage;
  private readonly now: () => number;
  private readonly logger: GatewayLogger | undefined;

  constructor(handlers: MessageHandlers, options: GatewayRuntimeOptions = {}) {
    this.routeMessage = createMessageRouter(handlers);
    this.now = options.now ?? Date.now;
    this.logger = options.logger;
  }

  attach(socket: GatewaySocket, identity: SocketIdentity): void {
    const rateLimiter = new MessageRateLimiter();
    this.heartbeat.track(socket);
    socket.on('message', (data) => {
      if (!rateLimiter.tryAccept(this.now())) {
        this.rejectForRate(socket, identity);
        return;
      }
      void this.routeMessage(data, { socket, identity });
    });
    socket.on('close', () => {
      this.heartbeat.untrack(socket);
      this.registry.remove(socket);
    });
    this.registry.add(socket, identity);
  }

  tickHeartbeat(): void {
    this.heartbeat.tick();
  }

  startHeartbeat(intervalMs?: number): () => void {
    return this.heartbeat.start(intervalMs);
  }

  private rejectForRate(socket: GatewaySocket, identity: SocketIdentity): void {
    this.logger?.warn(identity, 'Socket message rejected by rate limit');
    sendErrorFrame(
      socket,
      'rate-limited',
      `More than ${MAX_MESSAGES_PER_SECOND} messages in one second`,
    );
  }
}
