import { z } from 'zod';
import {
  ClientMessageSchema,
  QueuedCommandSchema,
  type ClientMessage,
} from '@tower-magnate/shared';
import {
  sendError,
  type DebugFrames,
  type HostSocket,
  type MessageContext,
  type MessageHandler,
  type MessageHandlers,
} from '../port';

export const MAX_MESSAGE_BYTES = 16 * 1024;

export type ClientFrame =
  { kind: 'message'; message: ClientMessage } | { kind: 'invalidCommand'; id: string };

const CommandIdEnvelopeSchema = z.object({
  v: z.int().positive(),
  t: z.literal('command'),
  p: z.object({ id: QueuedCommandSchema.shape.id }),
});

/** Reads one raw frame, or answers with an error frame and returns null. */
export function readClientFrame(rawData: unknown, socket: HostSocket): ClientFrame | null {
  const text = String(rawData);
  if (new TextEncoder().encode(text).length > MAX_MESSAGE_BYTES) {
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

/**
 * Routes one raw frame. A socket that has not joined (`isJoined` false) may only send hello;
 * its debug frames and every other message are dropped.
 */
export async function routeFrame(
  rawData: unknown,
  context: MessageContext,
  handlers: MessageHandlers,
  debugFrames?: DebugFrames,
  isJoined: () => boolean = () => true,
): Promise<void> {
  if (debugFrames?.typeOf(rawData)) {
    if (isJoined()) {
      await handleDebugFrame(debugFrames, rawData, context);
    }
    return;
  }
  const frame = readClientFrame(rawData, context.socket);
  if (!frame) {
    return;
  }
  const isHello = frame.kind === 'message' && frame.message.t === 'hello';
  if (!isHello && !isJoined()) {
    return;
  }
  if (frame.kind === 'invalidCommand') {
    rejectInvalidCommand(handlers, frame.id, context);
    return;
  }
  await routeMessage(handlers, frame.message, context);
}

async function handleDebugFrame(
  debugFrames: DebugFrames,
  rawData: unknown,
  context: MessageContext,
): Promise<void> {
  try {
    await debugFrames.handle(rawData, context);
  } catch {
    sendError(context.socket, 'INVALID_COMMAND', 'Could not handle the debug message');
  }
}
