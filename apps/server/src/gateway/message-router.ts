import { z } from 'zod';
import {
  ClientMessageSchema,
  QueuedCommandSchema,
  type ClientMessage,
  type ClientMessageType,
  type Envelope,
} from '@tower-magnate/shared';
import { sendError, type GatewaySocket, type SocketIdentity } from './socket';

export const MAX_MESSAGE_BYTES = 16 * 1024;

export interface MessageContext {
  socket: GatewaySocket;
  identity: SocketIdentity;
  /** Counts the socket for its tower, activating the tower when it is the first one. */
  join: () => void;
}

export type MessageHandler<T extends ClientMessageType> = (
  message: Envelope<ClientMessage, T>,
  context: MessageContext,
) => void | Promise<void>;

/** Frames outside the shared protocol, such as the dev-only debug messages. */
export interface DebugFrames {
  /** The message type when the raw frame is one of these, whether or not it is valid. */
  typeOf(rawData: unknown): string | null;
  handle(rawData: unknown, context: MessageContext): Promise<void>;
}

/** Answers a command whose envelope and id are valid but whose command fails the schema. */
export type InvalidCommandHandler = (id: string, context: MessageContext) => void;

export type MessageHandlers = { [T in ClientMessageType]?: MessageHandler<T> } & {
  invalidCommand?: InvalidCommandHandler;
};

export type ClientFrame =
  { kind: 'message'; message: ClientMessage } | { kind: 'invalidCommand'; id: string };

const CommandIdEnvelopeSchema = z.object({
  v: z.int().positive(),
  t: z.literal('command'),
  p: z.object({ id: QueuedCommandSchema.shape.id }),
});

/** Reads one raw frame, or answers with an error frame and returns null. */
export function readClientFrame(rawData: unknown, socket: GatewaySocket): ClientFrame | null {
  const text = String(rawData);
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) {
    sendError(socket, 'INVALID_COMMAND', `Messages are limited to ${MAX_MESSAGE_BYTES} bytes`);
    return null;
  }
  const json = parseJson(text);
  const result = ClientMessageSchema.safeParse(json);
  if (result.success) {
    return { kind: 'message', message: result.data };
  }
  const command = CommandIdEnvelopeSchema.safeParse(json);
  if (command.success) {
    return { kind: 'invalidCommand', id: command.data.p.id };
  }
  sendError(socket, 'INVALID_COMMAND', 'Not a valid client message');
  return null;
}

export function rejectInvalidCommand(
  handlers: MessageHandlers,
  id: string,
  context: MessageContext,
): void {
  if (!handlers.invalidCommand) {
    sendError(context.socket, 'INVALID_COMMAND', 'Not a valid client message');
    return;
  }
  handlers.invalidCommand(id, context);
}

export async function routeMessage(
  handlers: MessageHandlers,
  message: ClientMessage,
  context: MessageContext,
): Promise<void> {
  const handler = handlers[message.t] as MessageHandler<typeof message.t> | undefined;
  if (!handler) {
    sendError(context.socket, 'INVALID_COMMAND', `"${message.t}" is not supported yet`);
    return;
  }
  try {
    await handler(message, context);
  } catch {
    sendError(context.socket, 'INVALID_COMMAND', `Could not handle "${message.t}"`);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
