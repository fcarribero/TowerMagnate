import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DecisionKind } from '@tower-magnate/shared';
import type { GameConnection } from '../../net/gameConnection';
import { optionLabel } from './decisionModel';
import { AVISOS_KEPT, addToAvisos, isAlertKey, noticeFromView, type Notice } from './noticeModel';

export interface NoticesApi {
  avisos: readonly Notice[];
  /** Decisions the server closed, so their dialogs close at once. */
  closedIds: ReadonlySet<string>;
  /** Notices for the news line, in arrival order. */
  subscribeLine: (listener: (notice: Notice) => void) => () => void;
  answerEvent: (eventId: string, choice: string) => void;
}

function makeNotice(
  n: number,
  step: number,
  key: string,
  params: Record<string, string | number>,
  unitId: string | null,
): Notice {
  return { id: `local-${n}`, step, key, params, unitId, alert: isAlertKey(key) };
}

function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) {
    return ids;
  }
  const next = new Set(ids);
  next.delete(id);
  return next;
}

/** Collects notices from snapshots and news events for the news line and the Avisos window. */
export function useNotices(connection: GameConnection): NoticesApi {
  const [avisos, setAvisos] = useState<readonly Notice[]>([]);
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(new Set());
  const lineListeners = useRef(new Set<(notice: Notice) => void>());
  const answered = useRef(new Set<string>());
  const kinds = useRef(new Map<string, DecisionKind>());
  const nextId = useRef(1);

  useEffect(() => {
    const publish = (notice: Notice): void => {
      setAvisos((list) => addToAvisos(list, notice));
      for (const listener of lineListeners.current) {
        listener(notice);
      }
    };
    return connection.onMessage((message) => {
      if (message.t === 'snapshot') {
        // The snapshot lists notices oldest first.
        setAvisos(message.p.notices.map(noticeFromView).reverse().slice(0, AVISOS_KEPT));
        for (const event of message.p.activeEvents) {
          if (event.kind === 'decision') {
            kinds.current.set(event.id, event.decision);
          }
        }
        return;
      }
      if (message.t !== 'events') {
        return;
      }
      for (const event of message.p.events) {
        if (event.type === 'decisionOpened') {
          kinds.current.set(event.eventId, event.kind);
          setClosedIds((ids) => withoutId(ids, event.eventId));
        } else if (event.type === 'decisionClosed') {
          setClosedIds((ids) => new Set(ids).add(event.eventId));
          const kind = kinds.current.get(event.eventId);
          // An answer already has its own server news; only a timeout needs a notice here.
          if (!answered.current.delete(event.eventId) && kind !== undefined) {
            const option = optionLabel(kind, event.choice);
            publish(
              makeNotice(nextId.current++, event.step, 'news.decisionDefault', { option }, null),
            );
          }
        } else if (event.type === 'news' && event.key !== 'news.decisionDefault') {
          publish(makeNotice(nextId.current++, event.step, event.key, {}, event.unitId));
        }
      }
    });
  }, [connection]);

  return useMemo(
    () => ({
      avisos,
      closedIds,
      subscribeLine(listener) {
        lineListeners.current.add(listener);
        return () => {
          lineListeners.current.delete(listener);
        };
      },
      answerEvent(eventId, choice) {
        answered.current.add(eventId);
        void connection.commands.send({ type: 'answerEvent', eventId, choice });
      },
    }),
    [avisos, closedIds, connection],
  );
}
