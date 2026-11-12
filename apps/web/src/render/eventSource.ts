import type { ServerMessage } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { GameState } from '../model/gameState';
import {
  TransientEffects,
  fireSpansOf,
  planCathedral,
  planFire,
  planRoaches,
  weddingOf,
  type TransientEffect,
} from './eventPlan';
import type { EventsInput } from './stage';

const GROUND_LEVEL = 1;

function towerTopLevelOf(state: GameState): number {
  let top = GROUND_LEVEL;
  for (const level of state.structure.keys()) {
    top = Math.max(top, level);
  }
  return top;
}

/** Everything the active events and the room states draw in this state. */
export function eventsOf(state: GameState): EventsInput {
  const fire = fireSpansOf(state.activeEvents);
  const wedding = weddingOf(state.activeEvents);
  return {
    drawings: [
      ...planFire(fire),
      ...planRoaches(state.units.values()),
      ...(wedding === null ? [] : planCathedral(wedding.cathedral, state.units)),
    ],
    fire,
    guests: wedding?.guests ?? new Set(),
    towerTopLevel: towerTopLevelOf(state),
  };
}

/** Feeds `show` whenever the events, the units or the tower height change, and gives a reload nothing to replay. */
export function bindEvents(store: ClientStore, show: (input: EventsInput) => void): () => void {
  return store.select(
    (state) => ({
      activeEvents: state.activeEvents,
      units: state.units,
      structure: state.structure,
    }),
    () => {
      if (store.current !== null) {
        show(eventsOf(store.current.latest));
      }
    },
  );
}

/** Starts a transient effect for every blast, helicopter and Papa Noel the server announces while connected. */
export function bindEffects(
  onMessage: (listener: (message: ServerMessage) => void) => () => void,
  play: (effect: TransientEffect) => void,
): () => void {
  const effects = new TransientEffects();
  return onMessage((message) => {
    if (message.t !== 'events') {
      return;
    }
    for (const effect of effects.receive(message.p.events)) {
      play(effect);
    }
  });
}
