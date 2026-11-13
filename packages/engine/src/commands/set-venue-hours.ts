import { isValidVenueHours } from '@tower-magnate/shared';
import type { CommandHandler } from '../step';

/** Sets a fast food's opening and closing hour; it takes effect from the next day's plan. */
export const setVenueHours: CommandHandler<'setVenueHours'> = (context, command) => {
  if (typeof command.unitId !== 'string' || !isValidVenueHours(command)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (unit.type !== 'fast-food') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  unit.hours = { open: command.open, close: command.close };
  return { ok: true, cost: 0, refund: 0, events: [] };
};

/** Turns a fast food on or off. The switch applies from the next 00:00 (venue-staff.ts). */
export const setVenueEnabled: CommandHandler<'setVenueEnabled'> = (context, command) => {
  if (typeof command.unitId !== 'string' || typeof command.enabled !== 'boolean') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const unit = Object.hasOwn(context.state.units, command.unitId)
    ? context.state.units[command.unitId]
    : undefined;
  if (!unit) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  if (unit.type !== 'fast-food') {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  unit.enabled = command.enabled;
  return { ok: true, cost: 0, refund: 0, events: [] };
};
