import { ConnectionRegistry } from './connection-registry';
import { Heartbeat } from './heartbeat';
import {
  readClientMessage,
  routeMessage,
  type DebugFrames,
  type MessageContext,
  type MessageHandlers,
} from './message-router';
import { MAX_MESSAGES_PER_SECOND, MessageRateLimiter } from './rate-limiter';
import { CLOSE_CODES, sendError, type GatewaySocket, type SocketIdentity } from './socket';

export const HELLO_TIMEOUT_MS = 5_000;

export interface GatewayLogger {
  warn(details: object, message: string): void;
}

export interface GatewayRuntimeOptions {
  helloTimeoutMs?: number;
  now?: () => number;
  logger?: GatewayLogger;
  debugFrames?: DebugFrames;
}

/**
 * Owns the open tower sockets. A socket counts for its tower only after a handler calls
 * `context.join()`; until then every message except `hello` is dropped.
 */
export class Gateway {
  readonly registry = new ConnectionRegistry();
  private readonly heartbeat = new Heartbeat((socket) => this.registry.remove(socket));
  private readonly helloTimeoutMs: number;
  private readonly now: () => number;
  private readonly logger: GatewayLogger | undefined;
  private readonly debugFrames: DebugFrames | undefined;

  constructor(
    private readonly handlers: MessageHandlers = {},
    options: GatewayRuntimeOptions = {},
  ) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? HELLO_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.logger = options.logger;
    this.debugFrames = options.debugFrames;
  }

  attach(socket: GatewaySocket, identity: SocketIdentity): void {
    const rateLimiter = new MessageRateLimiter();
    this.heartbeat.track(socket);
    const helloTimer = setTimeout(() => this.closeWithoutHello(socket), this.helloTimeoutMs);
    socket.on('message', (data) => {
      if (!rateLimiter.tryAccept(this.now())) {
        this.rejectForRate(socket, identity);
        return;
      }
      void this.receive(socket, identity, data);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      this.heartbeat.untrack(socket);
      this.registry.remove(socket);
    });
  }

  tickHeartbeat(): void {
    this.heartbeat.tick();
  }

  startHeartbeat(intervalMs?: number): () => void {
    return this.heartbeat.start(intervalMs);
  }

  private async receive(
    socket: GatewaySocket,
    identity: SocketIdentity,
    data: unknown,
  ): Promise<void> {
    const join = () => this.registry.add(socket, identity);
    if (this.debugFrames?.typeOf(data)) {
      if (this.registry.hasSocket(socket)) {
        await this.handleDebugFrame(this.debugFrames, data, { socket, identity, join });
      }
      return;
    }
    const message = readClientMessage(data, socket);
    if (!message) {
      return;
    }
    if (message.t !== 'hello' && !this.registry.hasSocket(socket)) {
      return;
    }
    await routeMessage(this.handlers, message, { socket, identity, join });
  }

  private async handleDebugFrame(
    debugFrames: DebugFrames,
    data: unknown,
    context: MessageContext,
  ): Promise<void> {
    try {
      await debugFrames.handle(data, context);
    } catch {
      sendError(context.socket, 'INVALID_COMMAND', 'Could not handle the debug message');
    }
  }

  private closeWithoutHello(socket: GatewaySocket): void {
    if (!this.registry.hasSocket(socket)) {
      socket.close(CLOSE_CODES.noHello, 'No hello received');
    }
  }

  private rejectForRate(socket: GatewaySocket, identity: SocketIdentity): void {
    this.logger?.warn(identity, 'Socket message rejected by rate limit');
    sendError(
      socket,
      'RATE_LIMITED',
      `More than ${MAX_MESSAGES_PER_SECOND} messages in one second`,
    );
  }
}
