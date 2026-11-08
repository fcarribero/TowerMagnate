import {
  ClientMessageSchema,
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

export type MessageHandlers = { [T in ClientMessageType]?: MessageHandler<T> };

/** Reads one raw frame into a client message, or answers with an error frame and returns null. */
export function readClientMessage(rawData: unknown, socket: GatewaySocket): ClientMessage | null {
  const text = String(rawData);
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) {
    sendError(socket, 'INVALID_COMMAND', `Messages are limited to ${MAX_MESSAGE_BYTES} bytes`);
    return null;
  }
  const result = ClientMessageSchema.safeParse(parseJson(text));
  if (!result.success) {
    sendError(socket, 'INVALID_COMMAND', 'Not a valid client message');
    return null;
  }
  return result.data;
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
