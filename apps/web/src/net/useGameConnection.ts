import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createGameConnection, type GameConnection } from './gameConnection';
import {
  CLOSE_NOT_AUTHENTICATED,
  CLOSE_PROTOCOL_MISMATCH,
  gameSocketUrl,
  type ConnectionStatus,
} from './gameSocket';

export interface GameConnectionOptions {
  /** The server refused the session cookie. */
  onNotAuthenticated?: () => void;
}

/** Opens the tower socket for as long as the component is mounted. */
export function useGameConnection({ onNotAuthenticated }: GameConnectionOptions = {}): {
  connection: GameConnection;
  status: ConnectionStatus;
  protocolMismatch: boolean;
} {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [protocolMismatch, setProtocolMismatch] = useState(false);
  const notAuthenticatedRef = useRef(onNotAuthenticated);
  notAuthenticatedRef.current = onNotAuthenticated;

  const connection = useMemo(
    () =>
      createGameConnection({
        url: gameSocketUrl(location),
        validate: import.meta.env.DEV,
        onStatus: setStatus,
        onClosedForGood: (code) => {
          if (code === CLOSE_PROTOCOL_MISMATCH) {
            setProtocolMismatch(true);
          } else if (code === CLOSE_NOT_AUTHENTICATED) {
            notAuthenticatedRef.current?.();
          }
        },
      }),
    [],
  );

  useEffect(() => {
    connection.socket.connect();
    return () => {
      connection.viewport.stop();
      connection.socket.stop();
    };
  }, [connection]);

  return { connection, status, protocolMismatch };
}
