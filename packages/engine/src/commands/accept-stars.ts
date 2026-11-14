import type { CommandHandler } from '../step';

/** The player accepted the new rating message: the clock runs again. Accepting twice does nothing. */
export const acceptStarsCommand: CommandHandler<'acceptStars'> = (context) => {
  context.state.starsPending = false;
  return { ok: true, cost: 0, refund: 0, events: [] };
};
