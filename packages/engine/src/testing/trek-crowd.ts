import type { TowerState } from '@tower-magnate/shared';
import { addPerson, slotOfPerson } from '../people';
import { TransportGraph } from '../routing';
import type { StepContext } from '../step';
import { createTrekSystem, startTrek } from '../trek';
import { medianOf } from './fastest-run';
import { buildTower, plainTowerPlan } from './tower-builder';

export const TREK_CROWD_PEOPLE = 3000;
export const TREK_CROWD_STEPS = 200;
export const MAX_TREK_AVERAGE_MS = 1.0;
export const MAX_TREK_P99_MS = 5;

const LOBBY_WIDTH = 100;

export interface TrekCrowdTiming {
  averageMs: number;
  p99Ms: number;
}

/** A two-floor tower with `people` office workers walking along the lobby. */
export function trekCrowd(people = TREK_CROWD_PEOPLE): TowerState {
  const { state } = buildTower(plainTowerPlan(2, 0, LOBBY_WIDTH - 1));
  const context = contextOf(state);
  for (let index = 0; index < people; index++) {
    const id = addPerson(state, {
      kind: 'officeWorker',
      homeUnit: 0,
      level: 1,
      column: index % LOBBY_WIDTH,
    });
    const to = { level: 1, column: (index * 37 + 50) % LOBBY_WIDTH };
    startTrek(context, slotOfPerson(state.people, id), to);
  }
  return state;
}

/** Runs the trek system alone over a fresh crowd and times each step. */
export function timeTrekCrowd(
  people = TREK_CROWD_PEOPLE,
  steps = TREK_CROWD_STEPS,
): TrekCrowdTiming {
  const context = contextOf(trekCrowd(people));
  const system = createTrekSystem();
  const durations: number[] = [];
  for (let count = 0; count < steps; count++) {
    context.state.step += 1;
    const started = performance.now();
    system(context);
    durations.push(performance.now() - started);
  }
  durations.sort((a, b) => a - b);
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    averageMs: total / durations.length,
    p99Ms: durations[Math.floor(durations.length * 0.99)] as number,
  };
}

export function medianTrekCrowdTiming(runs: readonly TrekCrowdTiming[]): TrekCrowdTiming {
  return {
    averageMs: medianOf(runs.map((run) => run.averageMs)),
    p99Ms: medianOf(runs.map((run) => run.p99Ms)),
  };
}

function contextOf(state: TowerState): StepContext {
  return { state, events: [], graph: new TransportGraph(state) };
}
