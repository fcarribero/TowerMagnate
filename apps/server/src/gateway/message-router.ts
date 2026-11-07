import { sendFrame, type ErrorFrame, type GatewaySocket, type SocketIdentity } from './socket';

export interface IncomingMessage {
  type: string;
  [field: string]: unknown;
}

export interface MessageContext {
  socket: GatewaySocket;
  identity: SocketIdentity;
}

export type MessageHandler = (
  message: IncomingMessage,
  context: MessageContext,
) => void | Promise<void>;

export type MessageHandlers = Record<string, MessageHandler>;

export function createMessageRouter(handlers: MessageHandlers) {
  return async function routeMessage(rawData: unknown, context: MessageContext): Promise<void> {
    const message = parseMessage(rawData);
    if (!message) {
      sendError(context.socket, 'invalid-message', 'Expected a JSON object with a string "type"');
      return;
    }
    const handler = Object.hasOwn(handlers, message.type) ? handlers[message.type] : undefined;
    if (!handler) {
      sendError(context.socket, 'unknown-message-type', `Unknown message type "${message.type}"`);
      return;
    }
    try {
      await handler(message, context);
    } catch {
      sendError(context.socket, 'handler-failed', `Could not handle "${message.type}"`);
    }
  };
}

function parseMessage(rawData: unknown): IncomingMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(rawData));
  } catch {
    return null;
  }
  if (!isObject(parsed) || typeof parsed.type !== 'string') {
    return null;
  }
  return parsed as IncomingMessage;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendError(socket: GatewaySocket, code: ErrorFrame['code'], message: string): void {
  const frame: ErrorFrame = { type: 'error', code, message };
  sendFrame(socket, frame);
}
