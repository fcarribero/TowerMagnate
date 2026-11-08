import { useEffect, useState } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { DecisionDialog } from '../kit/Dialog';
import { Opened } from '../menu/RestartTowerDialogs';
import { t } from '../strings';
import {
  deadlineText,
  decisionBody,
  decisionParams,
  openDecisions,
  optionLabel,
} from './decisionModel';

const selectEvents = (state: GameState) => ({ events: state.activeEvents, step: state.step });

export interface DecisionDialogsProps {
  store: ClientStore;
  /** Sends answerEvent. */
  onAnswer: (eventId: string, choice: string) => void;
  /** Ids of decisions closed by the server (decisionClosed), so they close before the next delta. */
  closedIds: ReadonlySet<string>;
}

/**
 * One dialog per open decision. They come from activeEvents, so a reload or
 * reconnect reopens them with the deadline from the server.
 */
export function DecisionDialogs({ store, onAnswer, closedIds }: DecisionDialogsProps) {
  const selected = useStoreSelect(store, selectEvents);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (selected === null) {
      return;
    }
    const still = new Set(openDecisions(selected.events).map((event) => event.id));
    setAnswered((current) => {
      const kept = [...current].filter((id) => still.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [selected?.events]);
  if (selected === null) {
    return null;
  }
  const answer = (eventId: string, choice: string): void => {
    setAnswered((current) => new Set(current).add(eventId));
    onAnswer(eventId, choice);
  };
  return (
    <>
      {openDecisions(selected.events)
        .filter((event) => !answered.has(event.id) && !closedIds.has(event.id))
        .map((event) => {
          const params = decisionParams(event);
          const windowId = `decision-${event.id}`;
          return (
            <Opened key={event.id} id={windowId}>
              <DecisionDialog
                id={windowId}
                title={t(`dialog.${event.decision}.title`)}
                body={decisionBody(event.decision, params)}
                deadline={deadlineText(selected.step, event.deadlineStep)}
                options={event.options.map((option) => ({
                  id: option,
                  label: optionLabel(event.decision, option, params),
                }))}
                onAnswer={(choice) => answer(event.id, choice)}
              />
            </Opened>
          );
        })}
    </>
  );
}
