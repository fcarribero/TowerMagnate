import type { ServerMessage } from '@tower-magnate/shared';
import { ClientStore } from '../model/clientStore';
import { GameSocket, type GameSocketOptions } from './gameSocket';

export interface GameConnection {
  readonly store: ClientStore;
  readonly socket: GameSocket;
  /** Calls `listener` with every server message, after the store has seen it. */
  onMessage(listener: (message: ServerMessage) => void): () => void;
}

/**
 * A client store fed by a game socket. When the store needs a new snapshot
 * (stale delta or reconnect) the socket says hello again.
 */
export function createGameConnection(
  options: Omit<GameSocketOptions, 'sink'>,
  now?: () => number,
): GameConnection {
  let socket: GameSocket | null = null;
  const store = new ClientStore({ requestResync: () => socket?.resync(), now });
  const listeners = new Set<(message: ServerMessage) => void>();
  socket = new GameSocket({
    ...options,
    sink: {
      receive(message) {
        store.receive(message);
        for (const listener of listeners) {
          listener(message);
        }
      },
      reconnected: () => store.reconnected(),
    },
  });
  return {
    store,
    socket,
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
