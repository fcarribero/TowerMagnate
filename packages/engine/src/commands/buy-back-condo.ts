import type { CommandHandler } from '../step';
import { chargeMoney, constructionFundsError } from '../money';
import { removePeopleOfUnit } from '../people';

/**
 * Buys an owned condo back from its owners at today's appraisal. The owners move out at once and
 * the condo comes off the market, so it stays empty until it is listed again or demolished.
 */
export const buyBackCondo: CommandHandler<'buyBackCondo'> = (context, command) => {
  if (typeof command.unitId !== 'string') {
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
  const fundsError = constructionFundsError(state, price);
  if (fundsError) {
    return { ok: false, error: fundsError };
  }
  chargeMoney(state, 'condoBuybacks', price);
  unit.sale = null;
  unit.evaluation = null;
  unit.listed = false;
  removePeopleOfUnit(state, unit.id);
  return { ok: true, cost: price, refund: 0, events: [] };
};
