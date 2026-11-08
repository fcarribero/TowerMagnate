import { noticeParams } from '@tower-magnate/engine';
import type { ClientEvent, EngineEvent } from '@tower-magnate/shared';
import { noticeParamTexts } from './notice-params';

/** The engine events a player's screen reacts to. Everything else stays on the server. */
export function toClientEvents(events: readonly EngineEvent[]): ClientEvent[] {
  const result: ClientEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'decisionOpened':
        result.push({
          type: 'decisionOpened',
          step: event.step,
          eventId: event.eventId,
          kind: event.kind,
          deadlineStep: event.deadlineStep,
          options: event.options,
        });
        break;
      case 'decisionClosed':
        result.push({
          type: 'decisionClosed',
          step: event.step,
          eventId: event.eventId,
          choice: event.choice,
          timedOut: !('commandId' in event),
        });
        break;
      case 'disaster':
        result.push({ type: 'disaster', step: event.step, kind: event.kind, cells: event.cells });
        break;
      case 'news':
        result.push({
          type: 'news',
          step: event.step,
          key: event.key,
          unitId: 'unitId' in event ? event.unitId : null,
          params: noticeParamTexts(noticeParams(event)),
        });
        break;
      default:
        break;
    }
  }
  return result;
}
