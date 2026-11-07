import { serverMessage, type ServerErrorCode, type ServerMessage } from '@tower-magnate/shared';

export interface GatewaySocket {
  send(data: string): void;
  ping(): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'pong' | 'close', listener: () => void): unknown;
}

export interface SocketIdentity {
  userId: string;
  towerId: string;
}

export const CLOSE_CODES = {
  noHello: 4400,
  notAuthenticated: 4401,
  protocolMismatch: 4409,
  rateLimited: 4429,
} as const;

export function sendMessage(socket: GatewaySocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export function sendError(socket: GatewaySocket, code: ServerErrorCode, message: string): void {
  sendMessage(socket, serverMessage('error', { code, message }));
}
