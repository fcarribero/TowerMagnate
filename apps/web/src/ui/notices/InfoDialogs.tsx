import type { ServerMessage } from '@tower-magnate/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { InfoDialog } from '../kit/Dialog';
import { t } from '../strings';
import { Opened } from '../menu/RestartTowerDialogs';
import {
  isNewTower,
  messagesForEvents,
  pendingStarsMessage,
  welcomeMessage,
  type InfoMessage,
} from './infoDialogModel';

interface QueuedMessage extends InfoMessage {
  id: number;
}

export interface InfoDialogsProps {
  /** The connection's message feed. Events arrive live only, so a reload never replays them. */
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
  /** Sent when the player closes a new-rating message, so the game continues. */
  onAcceptStars?: () => void;
}

/**
 * Star, tower rank and welcome messages. They queue up and open one at a time. The game keeps
 * running behind them, except for a new rating: the server holds its clock until it is accepted.
 */
export function InfoDialogs({ subscribe, onAcceptStars }: InfoDialogsProps) {
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
        if (message.p.starsPending === true) {
          const pending = pendingStarsMessage(message.p.stars);
          if (pending !== null) {
            setQueue((current) =>
              current.some((item) => item.stars !== undefined)
                ? current
                : [...current, { ...pending, id: nextId.current++ }],
            );
          }
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
        buttonLabel={current.stars === undefined ? undefined : t('ui.acceptContinue')}
        modal={current.stars !== undefined}
        closable={current.stars === undefined}
        onClose={() => {
          if (current.stars !== undefined) onAcceptStars?.();
          setQueue((list) => list.filter((item) => item.id !== current.id));
        }}
      />
    </Opened>
  );
}
