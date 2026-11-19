import type { ClientMessage, ServerMessage } from '@tower-magnate/shared';

export type ConnectionStatus = 'connecting' | 'live' | 'retrying' | 'closed';

/** What the link feeds. `ClientStore` fits. */
export interface MessageSink {
  receive(message: ServerMessage): void;
  reconnected(): void;
}

/** The channel to the tower: the local Worker. */
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
