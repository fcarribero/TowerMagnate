import type { Viewport } from '@tower-magnate/shared';
import type { GatewaySocket } from '../gateway';

export const MAX_VIEWPORTS_PER_SECOND = 4;
const RATE_WINDOW_MS = 1000;

interface SocketViewport {
  viewport: Viewport | null;
  recentUpdates: number[];
}

/** The part of the tower each socket draws, which decides the people it is sent. */
export class Viewports {
  private readonly bySocket = new WeakMap<GatewaySocket, SocketViewport>();

  constructor(private readonly now: () => number = Date.now) {}

  get(socket: GatewaySocket): Viewport | null {
    return this.bySocket.get(socket)?.viewport ?? null;
  }

  /** Stores the viewport unless the socket already sent the most allowed this second. */
  update(socket: GatewaySocket, viewport: Viewport): boolean {
    const entry = this.bySocket.get(socket) ?? { viewport: null, recentUpdates: [] };
    const now = this.now();
    entry.recentUpdates = entry.recentUpdates.filter((time) => now - time < RATE_WINDOW_MS);
    if (entry.recentUpdates.length >= MAX_VIEWPORTS_PER_SECOND) {
      return false;
    }
    entry.recentUpdates.push(now);
    entry.viewport = viewport;
    this.bySocket.set(socket, entry);
    return true;
  }
}
