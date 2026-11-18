import { upgradePrice, upgradesOf } from '@tower-magnate/shared';
import type { CommandHandler } from '../step';
import { topUpOffice } from '../police';
import { payForConstruction } from './structure';

/**
 * Buys the next level of one upgrade for a built unit. The price is paid at once; the level is
 * stored on the unit. A unit with no upgrade by that name, or one that is at its top level, is refused.
 */
export const buyUpgrade: CommandHandler<'buyUpgrade'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.upgradeId !== 'string') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  const definition = upgradesOf(unit.type).find((item) => item.id === command.upgradeId);
  if (!definition) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const level = unit.upgrades?.[definition.id] ?? 0;
  if (level >= definition.maxLevel) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const price = upgradePrice(unit.type, level);
  const paymentError = payForConstruction(context.state, price);
  if (paymentError) {
    return { ok: false, error: paymentError };
  }
  unit.upgrades = { ...unit.upgrades, [definition.id]: level + 1 };
  // More guards come in on their shift from now on, not only from the next 00:00 roster check.
  if (unit.type === 'security' && definition.id === 'guards') topUpOffice(context.state, unit);
  return { ok: true, cost: price, refund: 0, events: [] };
};
