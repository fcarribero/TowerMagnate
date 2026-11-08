import { endPaidBombThreat } from '../events/bomb';
import { answerDecision } from '../events/decisions';
import type { CommandEvent, CommandHandler } from '../step';

export const answerEvent: CommandHandler<'answerEvent'> = (context, command) => {
  if (typeof command.eventId !== 'string' || typeof command.choice !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const kind = state.activeEvents.find((event) => event.id === command.eventId)?.kind;
  const answer = answerDecision(state, command.eventId, command.choice);
  if (!answer.ok) {
    return answer;
  }
  const events: CommandEvent[] = [
    { type: 'decisionClosed', eventId: command.eventId, choice: command.choice },
  ];
  if (kind === 'bomb' && command.choice === 'pay') {
    endPaidBombThreat(state, command.eventId);
    events.push({ type: 'news', key: 'news.bombPaid', unitId: null });
  }
  return { ok: true, cost: answer.cost, refund: 0, events };
};
