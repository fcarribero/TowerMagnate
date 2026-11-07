import type { GatewaySocket } from './socket';

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_MISSED_PINGS = 2;

export class Heartbeat {
  private readonly missedPings = new Map<GatewaySocket, number>();

  constructor(private readonly onDrop: (socket: GatewaySocket) => void = () => {}) {}

  track(socket: GatewaySocket): void {
    this.missedPings.set(socket, 0);
    socket.on('pong', () => {
      if (this.missedPings.has(socket)) {
        this.missedPings.set(socket, 0);
      }
    });
  }

  untrack(socket: GatewaySocket): void {
    this.missedPings.delete(socket);
  }

  tick(): void {
    for (const [socket, missed] of this.missedPings) {
      if (missed >= MAX_MISSED_PINGS) {
        this.drop(socket);
      } else {
        this.missedPings.set(socket, missed + 1);
        socket.ping();
      }
    }
  }

  start(intervalMs: number = HEARTBEAT_INTERVAL_MS): () => void {
    const timer = setInterval(() => this.tick(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private drop(socket: GatewaySocket): void {
    this.missedPings.delete(socket);
    socket.terminate();
    this.onDrop(socket);
  }
}
