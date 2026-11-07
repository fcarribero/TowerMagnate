import { ConnectionRegistry } from './connection-registry';
import { Heartbeat } from './heartbeat';
import { createMessageRouter, type MessageHandlers } from './message-router';
import type { GatewaySocket, SocketIdentity } from './socket';

export class Gateway {
  readonly registry = new ConnectionRegistry();
  private readonly heartbeat = new Heartbeat((socket) => this.registry.remove(socket));
  private readonly routeMessage;

  constructor(handlers: MessageHandlers) {
    this.routeMessage = createMessageRouter(handlers);
  }

  attach(socket: GatewaySocket, identity: SocketIdentity): void {
    this.heartbeat.track(socket);
    socket.on('message', (data) => void this.routeMessage(data, { socket, identity }));
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
}
