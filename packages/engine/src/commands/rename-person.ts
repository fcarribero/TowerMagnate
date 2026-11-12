import { normalizeName } from '@tower-magnate/shared';
import { parsePersonId, renamePerson as storeName } from '../people';
import type { CommandHandler } from '../step';

export const renamePerson: CommandHandler<'renamePerson'> = (context, command) => {
  const personId = parsePersonId(command.personId);
  if (personId === null || typeof command.name !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const error = storeName(context.state.people, personId, normalizeName(command.name));
  if (error) return { ok: false, error };
  return { ok: true, cost: 0, refund: 0, events: [] };
};
