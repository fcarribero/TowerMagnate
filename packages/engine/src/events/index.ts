import type { SimulationSystem } from '../step';
import { runBombSchedule } from './bomb';
import { runBombSearch } from './bomb-search';
import { runDecisionDeadlines } from './decisions';
import { runFireGuards, tickFireFronts } from './fire-guards';

export { buildEventViews } from './view';
export { answerDecision, endDisaster, openBombThreat, openFire } from './decisions';
export { startBombSearch } from './bomb-search';
export { blastColumns, blastLevels, openRandomBombThreat, ruinBlastBox } from './bomb';
export { pickFireTargets } from './fire-guards';

/** Event work of one step, in the order of events spec section 10. */
export const eventsPhase: SimulationSystem = (context) => {
  runDecisionDeadlines(context);
  runBombSchedule(context);
  if (context.state.activeEvents.length === 0) return;
  for (const event of [...context.state.activeEvents]) {
    if (event.kind === 'fire') {
      const levelWentOut = tickFireFronts(context, event);
      runFireGuards(context, event, levelWentOut);
    } else {
      runBombSearch(context, event);
    }
  }
};
