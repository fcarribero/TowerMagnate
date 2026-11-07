import { ClientStore } from '../model/clientStore';
import { GameSocket, type GameSocketOptions } from './gameSocket';

export interface GameConnection {
  readonly store: ClientStore;
  readonly socket: GameSocket;
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
  socket = new GameSocket({ ...options, sink: store });
  return { store, socket };
}
