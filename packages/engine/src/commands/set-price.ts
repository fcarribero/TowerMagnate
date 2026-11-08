import { PRICE_LEVELS, type UnitType } from '@tower-magnate/shared';
import type { CommandHandler } from '../step';

const PRICED_TYPES: readonly UnitType[] = [
  'office',
  'retail-shop',
  'single-room',
  'double-room',
  'suite',
  'condo',
];

/** Economy 3: free at any balance. Leases and check-ins read the level when they happen. */
export const setPrice: CommandHandler<'setPrice'> = (context, command) => {
  const validLevel = PRICE_LEVELS.some((level) => level === command.price);
  if (typeof command.unitId !== 'string' || !validLevel) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (!PRICED_TYPES.includes(unit.type)) {
    return { ok: false, error: 'NOT_PRICED' };
  }
  if (unit.type === 'condo' && unit.sale) {
    return { ok: false, error: 'PRICE_LOCKED' };
  }

  unit.priceLevel = command.price;
  return { ok: true, cost: 0, refund: 0, events: [] };
};
