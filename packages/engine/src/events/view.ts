import type {
  ActiveEvent,
  BurningLevel,
  EventView,
  FireSpan,
  Fire,
  TowerState,
} from '@tower-magnate/shared';

function spansOf(fire: Fire): FireSpan[] {
  return Object.keys(fire.levels)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => {
      const burning = fire.levels[level] as BurningLevel;
      return {
        level,
        x0: burning.left.x,
        x1: burning.right.x,
        out: burning.left.out && burning.right.out,
      };
    });
}

function viewOf(event: ActiveEvent): EventView {
  if (event.decision.choice === null) {
    return {
      kind: 'decision',
      id: event.id,
      decision: event.kind,
      deadlineStep: event.decision.deadlineStep,
      options: [...event.decision.options],
      ...(event.kind === 'bomb'
        ? { ransom: event.ransom }
        : { level: event.level, spans: spansOf(event) }),
    };
  }
  const base = { kind: 'disaster' as const, id: event.id, disaster: event.kind, cells: [] };
  return event.kind === 'fire' ? { ...base, spans: spansOf(event) } : base;
}

/** What the client sees of the active events. Never includes where a bomb is hidden. */
export function buildEventViews(state: TowerState): EventView[] {
  return state.activeEvents.map(viewOf);
}
