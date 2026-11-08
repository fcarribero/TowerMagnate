import type { CommandHandler } from '../step';

export const demolish: CommandHandler<'demolish'> = (_context, command) => {
  switch (command.target.kind) {
    case 'unit':
    case 'transport':
    case 'shaft':
    case 'floor':
    case 'lobby':
    case 'ruins':
      return { ok: false, error: 'NOTHING_TO_DEMOLISH' };
  }
};
