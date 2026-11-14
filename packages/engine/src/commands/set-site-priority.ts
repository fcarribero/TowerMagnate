import type { CommandHandler } from '../step';

/** Marks a construction site as a priority (or not): builders choose a priority site before the others. */
export const setSitePriority: CommandHandler<'setSitePriority'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.priority !== 'boolean') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const site = Object.hasOwn(context.state.sites, command.unitId)
    ? context.state.sites[command.unitId]
    : undefined;
  if (!site) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (command.priority) {
    site.priority = true;
  } else {
    Reflect.deleteProperty(site, 'priority');
  }
  return { ok: true, cost: 0, refund: 0, events: [] };
};
