import { normalizeName } from '@tower-magnate/shared';
import type { CommandHandler } from '../step';

export const renameUnit: CommandHandler<'renameUnit'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.name !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }

  unit.name = normalizeName(command.name);
  return {
    ok: true,
    cost: 0,
    refund: 0,
    events: [{ type: 'unitRenamed', unitId: unit.id, name: unit.name }],
  };
};
