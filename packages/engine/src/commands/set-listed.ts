import type { CommandHandler } from '../step';

/**
 * Lists a condo, office or shop (built or still a site) on the market or takes it off. Prospects only take a listed unit.
 * A rented unit that is unlisted keeps its tenant until the term ends, then the lease ends.
 * A sold condo cannot change.
 */
export const setListed: CommandHandler<'setListed'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.listed !== 'boolean') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const site = Object.hasOwn(context.state.sites, command.unitId)
    ? context.state.sites[command.unitId]
    : undefined;
  if (site) {
    if (site.type !== 'condo' && site.type !== 'office' && site.type !== 'retail-shop') {
      return { ok: false, error: 'NOT_PRICED' };
    }
    site.listed = command.listed;
    return { ok: true, cost: 0, refund: 0, events: [] };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (unit.type !== 'condo' && unit.type !== 'office' && unit.type !== 'retail-shop') {
    return { ok: false, error: 'NOT_PRICED' };
  }
  if (unit.type === 'condo' && unit.sale) {
    return { ok: false, error: 'PRICE_LOCKED' };
  }
  unit.listed = command.listed;
  return { ok: true, cost: 0, refund: 0, events: [] };
};
