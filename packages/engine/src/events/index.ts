import type { SimulationSystem, StepContext } from '../step';
import { rollBombThreat, runBombSchedule, type BombRoll } from './bomb';
import { runBombSearch } from './bomb-search';
import { runDecisionDeadlines } from './decisions';
import { runFireGuards, tickFireFronts } from './fire-guards';
import { runSanta } from './santa';

export { buildEventViews } from './view';
export { answerDecision, endDisaster, openBombThreat, openFire } from './decisions';
export { startBombSearch } from './bomb-search';
export {
  blastColumns,
  blastLevels,
  canOpenBombThreat,
  openRandomBombThreat,
  rollBombThreat,
  ruinBlastBox,
} from './bomb';
export type { BombRoll } from './bomb';
export { pickFireTargets } from './fire-guards';

/** Event work of one step, in the order of events spec section 10, with the given 09:00 bomb roll. */
export function createEventsPhase(rollBomb: BombRoll): SimulationSystem {
  return (context) => {
    runDecisionDeadlines(context);
    runBombSchedule(context, rollBomb);
    if (context.state.activeEvents.length > 0) runActiveEvents(context);
    runSanta(context);
  };
}

export const eventsPhase: SimulationSystem = createEventsPhase(rollBombThreat);

function runActiveEvents(context: StepContext): void {
  for (const event of [...context.state.activeEvents]) {
    if (event.kind === 'fire') {
      const levelWentOut = tickFireFronts(context, event);
      runFireGuards(context, event, levelWentOut);
    } else {
      runBombSearch(context, event);
    }
  }
}
