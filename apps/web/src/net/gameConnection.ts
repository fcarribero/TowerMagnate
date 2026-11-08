import { ClientStore } from '../model/clientStore';
import { InspectStore } from '../model/inspectStore';
import { CommandClient } from './commandClient';
import { GameSocket, type GameSocketOptions } from './gameSocket';

export interface GameConnection {
  readonly store: ClientStore;
  readonly inspect: InspectStore;
  readonly commands: CommandClient;
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
  const inspect = new InspectStore();
  const commands = new CommandClient({ send: (message) => socket?.send(message) ?? false });
  socket = new GameSocket({
    ...options,
    sink: {
      receive(message) {
        store.receive(message);
        inspect.receive(message);
        commands.receive(message);
      },
      reconnected() {
        commands.abandonPending();
        store.reconnected();
      },
    },
  });
  return { store, inspect, commands, socket };
}
