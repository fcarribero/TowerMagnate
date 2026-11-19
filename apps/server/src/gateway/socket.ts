import type { HostSocket } from '@tower-magnate/host';

export { CLOSE_CODES, sendError, sendMessage, type SocketIdentity } from '@tower-magnate/host';

export interface GatewaySocket extends HostSocket {
  ping(): void;
  terminate(): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'pong' | 'close', listener: () => void): unknown;
}
