import type { ServerMessage } from '@tower-magnate/shared';
import { ClientStore } from '../model/clientStore';
import { InspectStore } from '../model/inspectStore';
import { CommandClient } from './commandClient';
import { GameSocket, type GameSocketOptions } from './gameSocket';
import { ViewportReporter } from './viewportReporter';

export interface GameConnection {
  readonly store: ClientStore;
  readonly inspect: InspectStore;
  readonly commands: CommandClient;
  readonly socket: GameSocket;
  /** Feed it the camera; it tells the server which part of the tower to send people for. */
  readonly viewport: ViewportReporter;
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
  const inspect = new InspectStore();
  const commands = new CommandClient({ send: (message) => socket?.send(message) ?? false });
  const viewport = new ViewportReporter({ send: (message) => socket?.send(message) ?? false });
  const listeners = new Set<(message: ServerMessage) => void>();
  socket = new GameSocket({
    ...options,
    sink: {
      receive(message) {
        store.receive(message);
        inspect.receive(message);
        commands.receive(message);
        if (message.t === 'snapshot') {
          viewport.snapshotReceived();
        }
        for (const listener of listeners) {
          listener(message);
        }
      },
      reconnected() {
        commands.abandonPending();
        store.reconnected();
      },
    },
  });
  return {
    store,
    inspect,
    commands,
    socket,
    viewport,
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
