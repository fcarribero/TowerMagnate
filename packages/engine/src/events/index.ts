import type { SimulationSystem } from '../step';
import { runDecisionDeadlines } from './decisions';

export { buildEventViews } from './view';
export { answerDecision, endDisaster, openBombThreat, openFire } from './decisions';

/** Event work of one step, in the order of events spec section 10. */
export const eventsPhase: SimulationSystem = (context) => {
  runDecisionDeadlines(context);
};
