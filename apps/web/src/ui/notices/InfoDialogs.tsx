import type { ServerMessage } from '@tower-magnate/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { InfoDialog } from '../kit/Dialog';
import { Opened } from '../menu/RestartTowerDialogs';
import { isNewTower, messagesForEvents, welcomeMessage, type InfoMessage } from './infoDialogModel';

interface QueuedMessage extends InfoMessage {
  id: number;
}

export interface InfoDialogsProps {
  /** The connection's message feed. Events arrive live only, so a reload never replays them. */
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
}

/**
 * Star, tower rank and welcome messages. They queue up and open one at a time,
 * and the game keeps running behind them.
 */
export function InfoDialogs({ subscribe }: InfoDialogsProps) {
  const [queue, setQueue] = useState<readonly QueuedMessage[]>([]);
  const nextId = useRef(1);
  const welcomed = useRef(false);

  useEffect(() => {
    const enqueue = (messages: readonly InfoMessage[]): void => {
      if (messages.length === 0) {
        return;
      }
      const queued = messages.map((message) => ({ ...message, id: nextId.current++ }));
      setQueue((current) => [...current, ...queued]);
    };
    return subscribe((message) => {
      if (message.t === 'snapshot') {
        if (!welcomed.current && isNewTower(message.p)) {
          welcomed.current = true;
          enqueue([welcomeMessage()]);
        }
        return;
      }
      if (message.t === 'events') {
        enqueue(messagesForEvents(message.p.events));
      }
    });
  }, [subscribe]);

  const current = queue[0];
  if (current === undefined) {
    return null;
  }
  const windowId = `info-${current.id}`;
  return (
    <Opened key={current.id} id={windowId}>
      <InfoDialog
        id={windowId}
        title={current.title}
        body={current.body}
        onClose={() => setQueue((list) => list.filter((item) => item.id !== current.id))}
      />
    </Opened>
  );
}
