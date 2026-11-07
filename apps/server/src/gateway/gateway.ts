import { ConnectionRegistry } from './connection-registry';
import { Heartbeat } from './heartbeat';
import { readClientMessage, routeMessage, type MessageHandlers } from './message-router';
import { CLOSE_CODES, type GatewaySocket, type SocketIdentity } from './socket';

export const HELLO_TIMEOUT_MS = 5_000;

export interface GatewayOptions {
  helloTimeoutMs?: number;
}

/**
 * Owns the open tower sockets. A socket counts for its tower only after a handler calls
 * `context.join()`; until then every message except `hello` is dropped.
 */
export class Gateway {
  readonly registry = new ConnectionRegistry();
  private readonly heartbeat = new Heartbeat((socket) => this.registry.remove(socket));
  private readonly helloTimeoutMs: number;

  constructor(
    private readonly handlers: MessageHandlers = {},
    options: GatewayOptions = {},
  ) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? HELLO_TIMEOUT_MS;
  }

  attach(socket: GatewaySocket, identity: SocketIdentity): void {
    this.heartbeat.track(socket);
    const helloTimer = setTimeout(() => this.closeWithoutHello(socket), this.helloTimeoutMs);
    socket.on('message', (data) => void this.receive(socket, identity, data));
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
    const message = readClientMessage(data, socket);
    if (!message) {
      return;
    }
    if (message.t !== 'hello' && !this.registry.hasSocket(socket)) {
      return;
    }
    const join = () => this.registry.add(socket, identity);
    await routeMessage(this.handlers, message, { socket, identity, join });
  }

  private closeWithoutHello(socket: GatewaySocket): void {
    if (!this.registry.hasSocket(socket)) {
      socket.close(CLOSE_CODES.noHello, 'No hello received');
    }
  }
}
