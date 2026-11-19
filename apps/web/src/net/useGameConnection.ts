import type { PlayResponse } from '@tower-magnate/shared';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createGameConnection, type GameConnection } from './gameConnection';
import type { ConnectionStatus } from './towerLink';
import { WorkerSocket, type FlushOutcome, type WorkerLike } from './workerSocket';

export interface GameConnectionOptions {
  play: PlayResponse;
  /** Debug and developer messages are answered only when true. */
  debug: boolean;
  onTakenOver?: () => void;
  onOutdated?: () => void;
  onSaveFailing?: (failing: boolean) => void;
  onSessionLost?: () => void;
  onFatal?: (message: string) => void;
  /** Tests stand in for the Worker. Read once, when the connection is made. */
  createWorker?: () => WorkerLike;
}

/** Runs the tower in a Worker for as long as the component is mounted. */
export function useGameConnection(options: GameConnectionOptions): {
  connection: GameConnection;
  status: ConnectionStatus;
  /** Saves the tower now and waits for the upload, or for the Worker's time limit. */
  flush: () => Promise<FlushOutcome>;
} {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const latest = useRef(options);
  latest.current = options;

  const { play, debug } = options;
  const worker = useRef<WorkerSocket | null>(null);
  const connection = useMemo(
    () =>
      createGameConnection(
        (sink) =>
          (worker.current = new WorkerSocket({
            sink,
            play,
            debug,
            createWorker: latest.current.createWorker,
            validate: import.meta.env.DEV,
            onStatus: setStatus,
            onTakenOver: () => latest.current.onTakenOver?.(),
            onOutdated: () => latest.current.onOutdated?.(),
            onSaveFailing: (failing) => latest.current.onSaveFailing?.(failing),
            onSessionLost: () => latest.current.onSessionLost?.(),
            onFatal: (message) => latest.current.onFatal?.(message),
          })),
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

  const flush = (): Promise<FlushOutcome> =>
    worker.current?.flush() ?? Promise.resolve<FlushOutcome>('failed');

  return { connection, status, flush };
}
