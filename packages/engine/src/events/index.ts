import type { SimulationSystem, StepContext } from '../step';
import { runBombSchedule } from './bomb';
import { runBombSearch } from './bomb-search';
import { runDecisionDeadlines } from './decisions';
import { runFire, runFireRoll } from './fire';
import { runSanta } from './santa';

export { buildEventViews } from './view';
export { answerDecision, endDisaster, openBombThreat, openFire } from './decisions';
export { startBombSearch } from './bomb-search';
export { blastColumns, blastLevels, openRandomBombThreat, ruinBlastBox } from './bomb';
export { pickFireTargets } from './fire-guards';
export { announceSanta } from './santa';
export { fireCandidates, igniteLevel, openRandomFire } from './fire';

/** Event work of one step, in the order of events spec section 10. */
export const eventsPhase: SimulationSystem = (context) => {
  runDecisionDeadlines(context);
  runBombSchedule(context);
  runFireRoll(context);
  if (context.state.activeEvents.length > 0) runActiveEvents(context);
  runSanta(context);
};

function runActiveEvents(context: StepContext): void {
  for (const event of [...context.state.activeEvents]) {
    if (event.kind === 'fire') {
      runFire(context, event);
    } else {
      runBombSearch(context, event);
    }
  }
}
