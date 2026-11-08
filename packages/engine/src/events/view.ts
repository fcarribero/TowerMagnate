import type { ActiveEvent, EventView, TowerState } from '@tower-magnate/shared';

function viewOf(event: ActiveEvent): EventView {
  if (event.decision.choice === null) {
    return {
      kind: 'decision',
      id: event.id,
      decision: event.kind,
      deadlineStep: event.decision.deadlineStep,
      options: [...event.decision.options],
    };
  }
  return { kind: 'disaster', id: event.id, disaster: event.kind, cells: [] };
}

/** What the client sees of the active events. Never includes where a bomb is hidden. */
export function buildEventViews(state: TowerState): EventView[] {
  return state.activeEvents.map(viewOf);
}
