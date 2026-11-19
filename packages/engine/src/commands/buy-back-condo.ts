import type { CommandHandler } from '../step';
import { chargeMoney, constructionFundsError } from '../money';
import { removePeopleOfUnit } from '../people';

/**
 * Buys an owned condo back from its owners at today's appraisal. The owners move out at once, the
 * sale price is reset to that appraisal and the condo comes off the market, so it stays empty
 * until it is listed again or demolished.
 */
export const buyBackCondo: CommandHandler<'buyBackCondo'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.price !== 'number') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const unit = Object.hasOwn(state.units, command.unitId) ? state.units[command.unitId] : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (unit.type !== 'condo' || !unit.sale) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const price = unit.appraisal;
  if (command.price !== price) {
    return { ok: false, error: 'PRICE_CHANGED' };
  }
  const fundsError = constructionFundsError(state, price);
  if (fundsError) {
    return { ok: false, error: fundsError };
  }
  chargeMoney(state, 'condoBuybacks', price);
  unit.sale = null;
  unit.evaluation = null;
  unit.listed = false;
  unit.price = price;
  removePeopleOfUnit(state, unit.id);
  return { ok: true, cost: price, refund: 0, events: [] };
};
