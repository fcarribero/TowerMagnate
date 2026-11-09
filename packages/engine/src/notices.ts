import {
  NOTICES_KEPT,
  type EngineEvent,
  type Notice,
  type TowerState,
} from '@tower-magnate/shared';

type NewsEvent = Extract<EngineEvent, { type: 'news' }>;

function isNews(event: EngineEvent): event is NewsEvent {
  return event.type === 'news';
}

/** Keeps the news of a step as notices, so a client that connects later still sees them. */
export function recordNotices(state: TowerState, events: readonly EngineEvent[]): void {
  for (const event of events.filter(isNews)) {
    const sameStep = state.notices.filter((notice) => notice.step === event.step).length;
    const notice: Notice = {
      id: `n${event.step}.${sameStep}`,
      step: event.step,
      key: event.key,
      unitId: event.unitId,
      params: { ...event.params },
    };
    state.notices.push(notice);
  }
  state.notices.splice(0, Math.max(0, state.notices.length - NOTICES_KEPT));
}
