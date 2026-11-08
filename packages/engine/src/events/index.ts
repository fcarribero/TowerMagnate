import type { SimulationSystem } from '../step';
import { runBombSearch } from './bomb-search';
import { runDecisionDeadlines } from './decisions';
import { runFireGuards, tickFireFronts } from './fire-guards';
import { runSanta } from './santa';

export { buildEventViews } from './view';
export { answerDecision, endDisaster, openBombThreat, openFire } from './decisions';
export { startBombSearch } from './bomb-search';
export { pickFireTargets } from './fire-guards';

/** Event work of one step, in the order of events spec section 10. */
export const eventsPhase: SimulationSystem = (context) => {
  runDecisionDeadlines(context);
  for (const event of [...context.state.activeEvents]) {
    if (event.kind === 'fire') {
      const levelWentOut = tickFireFronts(context, event);
      runFireGuards(context, event, levelWentOut);
    } else {
      runBombSearch(context, event);
    }
  }
  runSanta(context);
};
