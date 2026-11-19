import type { PlayResponse } from '@tower-magnate/shared';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createGameConnection, type GameConnection } from './gameConnection';
import type { ConnectionStatus } from './towerLink';
import { WorkerSocket, type WorkerLike } from './workerSocket';

export interface GameConnectionOptions {
  play: PlayResponse;
  /** Debug and developer messages are answered only when true. */
  debug: boolean;
  onTakenOver?: () => void;
  onOutdated?: () => void;
  onSaveFailing?: (failing: boolean) => void;
  onFatal?: (message: string) => void;
  /** Tests stand in for the Worker. Read once, when the connection is made. */
  createWorker?: () => WorkerLike;
}

/** Runs the tower in a Worker for as long as the component is mounted. */
export function useGameConnection(options: GameConnectionOptions): {
  connection: GameConnection;
  status: ConnectionStatus;
} {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const latest = useRef(options);
  latest.current = options;

  const { play, debug } = options;
  const connection = useMemo(
    () =>
      createGameConnection(
        (sink) =>
          new WorkerSocket({
            sink,
            play,
            debug,
            createWorker: latest.current.createWorker,
            validate: import.meta.env.DEV,
            onStatus: setStatus,
            onTakenOver: () => latest.current.onTakenOver?.(),
            onOutdated: () => latest.current.onOutdated?.(),
            onSaveFailing: (failing) => latest.current.onSaveFailing?.(failing),
            onFatal: (message) => latest.current.onFatal?.(message),
          }),
      ),
    [play, debug],
  );

  useEffect(() => {
    connection.socket.connect();
    return () => {
      connection.viewport.stop();
      connection.socket.stop();
    };
  }, [connection]);

  return { connection, status };
}
