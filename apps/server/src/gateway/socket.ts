export interface GatewaySocket {
  send(data: string): void;
  ping(): void;
  terminate(): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'pong' | 'close', listener: () => void): unknown;
}

export interface SocketIdentity {
  userId: string;
  towerId: string;
}

export interface ErrorFrame {
  type: 'error';
  code: 'invalid-message' | 'unknown-message-type' | 'handler-failed' | 'rate-limited';
  message: string;
}

export function sendFrame(socket: GatewaySocket, frame: object): void {
  socket.send(JSON.stringify(frame));
}

export function sendErrorFrame(
  socket: GatewaySocket,
  code: ErrorFrame['code'],
  message: string,
): void {
  const frame: ErrorFrame = { type: 'error', code, message };
  sendFrame(socket, frame);
}
