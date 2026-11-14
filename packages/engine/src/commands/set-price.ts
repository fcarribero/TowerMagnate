import { isPricedType, priceBounds } from '@tower-magnate/shared';
import type { CommandHandler } from '../step';

/**
 * Economy 3: free at any balance. Any whole price from priceBounds is allowed. Leases and
 * check-ins read the price when they happen.
 */
export const setPrice: CommandHandler<'setPrice'> = (context, command) => {
  if (typeof command.unitId !== 'string' || !Number.isInteger(command.price)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const site = Object.hasOwn(context.state.sites, command.unitId)
    ? context.state.sites[command.unitId]
    : undefined;
  if (site) {
    if (!isPricedType(site.type)) {
      return { ok: false, error: 'NOT_PRICED' };
    }
    const bounds = priceBounds(site);
    if (command.price < bounds.min || command.price > bounds.max) {
      return { ok: false, error: 'INVALID_COMMAND' };
    }
    site.price = command.price;
    return { ok: true, cost: 0, refund: 0, events: [] };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (!isPricedType(unit.type)) {
    return { ok: false, error: 'NOT_PRICED' };
  }
  if (unit.type === 'condo' && unit.sale) {
    return { ok: false, error: 'PRICE_LOCKED' };
  }
  const { min, max } = priceBounds(unit);
  if (command.price < min || command.price > max) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }

  unit.price = command.price;
  return { ok: true, cost: 0, refund: 0, events: [] };
};
