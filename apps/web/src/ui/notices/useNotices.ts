import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DecisionKind, NoticeView } from '@tower-magnate/shared';
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

function isServerNotice(view: NoticeView): boolean {
  return view.key !== 'news.decisionDefault';
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
export function useNotices(
  connection: GameConnection,
  onRejected: (error: string) => void,
): NoticesApi {
  const [avisos, setAvisos] = useState<readonly Notice[]>([]);
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(new Set());
  const lineListeners = useRef(new Set<(notice: Notice) => void>());
  const answered = useRef(new Set<string>());
  const kinds = useRef(new Map<string, DecisionKind>());
  const nextId = useRef(1);
  const seen = useRef(new Set<string>());

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
        const fromServer = message.p.notices.filter(isServerNotice);
        seen.current = new Set(fromServer.map((notice) => notice.id));
        setAvisos(fromServer.map(noticeFromView).reverse().slice(0, AVISOS_KEPT));
        for (const event of message.p.activeEvents) {
          if (event.kind === 'decision') {
            kinds.current.set(event.id, event.decision);
          }
        }
        return;
      }
      if (message.t === 'delta') {
        for (const view of message.p.notices ?? []) {
          if (isServerNotice(view) && !seen.current.has(view.id)) {
            seen.current.add(view.id);
            publish(noticeFromView(view));
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
          answered.current.delete(event.eventId);
          // An answer has its own server notice; a timeout is worded here with the option applied.
          if (event.timedOut && kind !== undefined) {
            const option = optionLabel(kind, event.choice);
            publish(
              makeNotice(nextId.current++, event.step, 'news.decisionDefault', { option }, null),
            );
          }
        }
      }
    });
  }, [connection]);

  const subscribeLine = useCallback((listener: (notice: Notice) => void) => {
    lineListeners.current.add(listener);
    return () => {
      lineListeners.current.delete(listener);
    };
  }, []);

  return useMemo(
    () => ({
      avisos,
      closedIds,
      subscribeLine,
      answerEvent(eventId, choice) {
        answered.current.add(eventId);
        void connection.commands.send({ type: 'answerEvent', eventId, choice }).then((result) => {
          if (!result.ok) {
            answered.current.delete(eventId);
            onRejected(result.error);
          }
        });
      },
    }),
    [avisos, closedIds, subscribeLine, connection, onRejected],
  );
}
