import { answerDecision } from '../events/decisions';
import type { CommandHandler } from '../step';

export const answerEvent: CommandHandler<'answerEvent'> = (context, command) => {
  if (typeof command.eventId !== 'string' || typeof command.choice !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const answer = answerDecision(context.state, command.eventId, command.choice);
  if (!answer.ok) {
    return answer;
  }
  return {
    ok: true,
    cost: answer.cost,
    refund: 0,
    events: [{ type: 'decisionClosed', eventId: command.eventId, choice: command.choice }],
  };
};
