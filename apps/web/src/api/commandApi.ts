import { clientMessage, type Command, type ServerMessage } from '@tower-magnate/shared';

/** What came of a command: the server took it and charged `cost`, or refused with an error code. */
export type CommandOutcome = { ok: true; cost: number } | { ok: false; error: string };

export const NOT_SENT_ERROR = 'unknown';

export interface CommandChannel {
  send(message: ReturnType<typeof clientMessage<'command'>>): boolean;
}

export interface CommandApi {
  /** Resolves when the server answers. Resolves at once with a failure when the socket is down. */
  send(command: Command): Promise<CommandOutcome>;
  /** Feed every server message here so answers reach their commands. */
  receive(message: ServerMessage): void;
}

export interface CommandApiOptions {
  channel: CommandChannel;
  /** Told about each command as it goes out, for the sound director. */
  onSent?: (queued: { id: string; command: Command }) => void;
  newId?: () => string;
}

export function createCommandApi({ channel, onSent, newId }: CommandApiOptions): CommandApi {
  const pending = new Map<string, (outcome: CommandOutcome) => void>();
  let counter = 0;
  const nextId = newId ?? ((): string => `c${(counter += 1)}`);

  return {
    send(command) {
      const queued = { id: nextId(), command };
      return new Promise((resolve) => {
        pending.set(queued.id, resolve);
        if (!channel.send(clientMessage('command', queued))) {
          pending.delete(queued.id);
          resolve({ ok: false, error: NOT_SENT_ERROR });
          return;
        }
        onSent?.(queued);
      });
    },
    receive(message) {
      if (message.t !== 'commandResult') {
        return;
      }
      const result = message.p;
      const resolve = pending.get(result.id);
      pending.delete(result.id);
      resolve?.(result.ok ? { ok: true, cost: result.cost } : { ok: false, error: result.error });
    },
  };
}
