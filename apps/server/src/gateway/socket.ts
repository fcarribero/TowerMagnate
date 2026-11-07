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
  code: 'invalid-message' | 'unknown-message-type' | 'handler-failed';
  message: string;
}

export function sendFrame(socket: GatewaySocket, frame: object): void {
  socket.send(JSON.stringify(frame));
}
