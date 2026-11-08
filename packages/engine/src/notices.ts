import {
  NOTICES_KEPT,
  type EngineEvent,
  type Notice,
  type NoticeParams,
  type TowerState,
} from '@tower-magnate/shared';

type NewsEvent = Extract<EngineEvent, { type: 'news' }>;

function isNews(event: EngineEvent): event is NewsEvent {
  return event.type === 'news';
}

/** The values a news event carries for its text: a level, an amount of money, a star count. */
export function noticeParams(event: NewsEvent): NoticeParams {
  const params: NoticeParams = {};
  if ('level' in event) params.level = event.level;
  if ('amount' in event) params.amount = event.amount;
  if ('n' in event) params.n = event.n;
  if ('choice' in event) params.option = event.choice;
  return params;
}

/** Keeps the news of a step as notices, so a client that connects later still sees them. */
export function recordNotices(state: TowerState, events: readonly EngineEvent[]): void {
  for (const event of events.filter(isNews)) {
    const sameStep = state.notices.filter((notice) => notice.step === event.step).length;
    const notice: Notice = {
      id: `n${event.step}.${sameStep}`,
      step: event.step,
      key: event.key,
      unitId: 'unitId' in event ? event.unitId : null,
      params: noticeParams(event),
    };
    state.notices.push(notice);
  }
  state.notices.splice(0, Math.max(0, state.notices.length - NOTICES_KEPT));
}
