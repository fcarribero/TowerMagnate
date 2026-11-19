import {
  serverMessage,
  type ClientMessage,
  type ClientMessageType,
  type Envelope,
  type ServerErrorCode,
  type ServerMessage,
} from '@tower-magnate/shared';

/** What the host needs from a connection: a way to send text and a way to close. */
export interface HostSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** The connected sockets, grouped by tower. */
export interface SocketSet {
  socketsForTower(towerId: string): Iterable<HostSocket>;
  allSockets(): Iterable<HostSocket>;
}

export interface SocketIdentity {
  userId: string;
  towerId: string;
}

export interface MessageContext {
  socket: HostSocket;
  identity: SocketIdentity;
  /** Counts the socket for its tower, activating the tower when it is the first one. */
  join: () => void;
}

export type MessageHandler<T extends ClientMessageType> = (
  message: Envelope<ClientMessage, T>,
  context: MessageContext,
) => void | Promise<void>;

export type MessageHandlers = { [T in ClientMessageType]?: MessageHandler<T> } & {
  /** Answers a command whose envelope and id are valid but whose command fails the schema. */
  invalidCommand?: (id: string, context: MessageContext) => void;
};

/** Frames outside the shared protocol, such as the dev-only debug messages. */
export interface DebugFrames {
  /** The message type when the raw frame is one of these, whether or not it is valid. */
  typeOf(rawData: unknown): string | null;
  handle(rawData: unknown, context: MessageContext): Promise<void>;
}

export const CLOSE_CODES = {
  protocolMismatch: 4409,
} as const;

export function sendMessage(socket: HostSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export function sendError(socket: HostSocket, code: ServerErrorCode, message: string): void {
  sendMessage(socket, serverMessage('error', { code, message }));
}
