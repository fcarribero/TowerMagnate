import { useEffect, useMemo, useState } from 'preact/hooks';
import { createGameConnection, type GameConnection } from './gameConnection';
import { CLOSE_PROTOCOL_MISMATCH, gameSocketUrl, type ConnectionStatus } from './gameSocket';

/** Opens the tower socket for as long as the component is mounted. */
export function useGameConnection(): { connection: GameConnection; status: ConnectionStatus } {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const connection = useMemo(
    () =>
      createGameConnection({
        url: gameSocketUrl(location),
        validate: import.meta.env.DEV,
        onStatus: setStatus,
        onClosedForGood: (code) => {
          if (code === CLOSE_PROTOCOL_MISMATCH) {
            location.reload();
          }
        },
      }),
    [],
  );

  useEffect(() => {
    connection.socket.connect();
    return () => connection.socket.stop();
  }, [connection]);

  return { connection, status };
}
