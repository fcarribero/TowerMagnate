import { followPerson, parsePersonId, unfollowPerson } from '../people';
import type { CommandHandler, CommandOutcome } from '../step';
import type { ErrorCode } from '@tower-magnate/shared';

function outcomeOf(error: ErrorCode | null): CommandOutcome {
  if (error) return { ok: false, error };
  return { ok: true, cost: 0, refund: 0, events: [] };
}

export const followPersonCommand: CommandHandler<'followPerson'> = (context, command) => {
  const personId = parsePersonId(command.personId);
  if (personId === null) return { ok: false, error: 'INVALID_COMMAND' };
  return outcomeOf(followPerson(context.state.people, personId));
};

export const unfollowPersonCommand: CommandHandler<'unfollowPerson'> = (context, command) => {
  const personId = parsePersonId(command.personId);
  if (personId === null) return { ok: false, error: 'INVALID_COMMAND' };
  return outcomeOf(unfollowPerson(context.state.people, personId));
};
