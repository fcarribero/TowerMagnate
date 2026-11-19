import type { ClientMessage } from '@tower-magnate/shared';
import type { ConnectionStatus } from './gameSocket';

/** The channel to the tower: the old WebSocket or the local Worker. */
export interface TowerLink {
  readonly connectionStatus: ConnectionStatus;
  connect(): void;
  stop(): void;
  /** Asks for a fresh snapshot. */
  resync(): void;
  send(message: ClientMessage): boolean;
  /** Sends a dev-only message; the tower refuses it unless debug is on. */
  sendDebug(type: string, payload: Record<string, unknown>): boolean;
}
