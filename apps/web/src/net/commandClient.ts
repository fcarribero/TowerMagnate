import {
  clientMessage,
  type ClientMessage,
  type Command,
  type CommandResult,
  type InspectTarget,
  type ServerMessage,
} from '@tower-magnate/shared';

/** The part of the game socket the client API uses. */
export interface MessageSender {
  send(message: ClientMessage): boolean;
}

/** What a command ends in when the server never saw it. */
function notSent(id: string): CommandResult {
  return { id, ok: false, step: 0, error: 'INVALID_COMMAND' };
}

/**
 * The one place the UI sends commands and inspect targets through. Every
 * command gets a fresh id, and its promise settles with the matching
 * `commandResult`.
 */
export class CommandClient {
  private nextId = 1;
  private readonly pending = new Map<string, (result: CommandResult) => void>();

  constructor(private readonly sender: MessageSender) {}

  receive(message: ServerMessage): void {
    if (message.t !== 'commandResult') {
      return;
    }
    const settle = this.pending.get(message.p.id);
    if (settle !== undefined) {
      this.pending.delete(message.p.id);
      settle(message.p);
    }
  }

  /** The socket dropped: commands still waiting will never be answered. */
  abandonPending(): void {
    for (const [id, settle] of this.pending) {
      settle(notSent(id));
    }
    this.pending.clear();
  }

  send(command: Command): Promise<CommandResult> {
    const id = `c${this.nextId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      if (!this.sender.send(clientMessage('command', { id, command }))) {
        this.pending.delete(id);
        resolve(notSent(id));
      }
    });
  }

  renameUnit(unitId: string, name: string): Promise<CommandResult> {
    return this.send({ type: 'renameUnit', unitId, name });
  }

  setPrice(unitId: string, price: Extract<Command, { type: 'setPrice' }>['price']) {
    return this.send({ type: 'setPrice', unitId, price });
  }

  changeFilm(unitId: string): Promise<CommandResult> {
    return this.send({ type: 'changeFilm', unitId });
  }

  inspect(target: InspectTarget | null): void {
    this.sender.send(clientMessage('inspect', { target }));
  }
}
