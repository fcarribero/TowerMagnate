import type { TowerState, UnitType } from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';
import { createCustomers } from '../customers';
import { createElevatorSystem } from '../elevators';
import { createScheduler } from '../scheduler';
import { createEngine, type SimulationSystem } from '../step';
import { createTrekSystem } from '../trek';
import { fastestRunMillis } from './fastest-run';
import { buildTower, plainTowerPlan, type PlannedUnit } from './tower-builder';

/** Budget for what outside customers add to one simulation step, in milliseconds. */
export const MAX_CUSTOMER_STEP_MS = 0.1;

const FLOOR_LAYOUT: readonly { type: UnitType; x: number }[] = [
  { type: 'fast-food', x: 104 },
  { type: 'restaurant', x: 120 },
  { type: 'retail-shop', x: 144 },
  { type: 'retail-shop', x: 156 },
  { type: 'retail-shop', x: 168 },
  { type: 'retail-shop', x: 180 },
];

/** Ten floors with a fast food, a restaurant and four let shops on each of levels 2..10. */
export function venueTower(): TowerState {
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= 10; level++) {
    for (const venue of FLOOR_LAYOUT) units.push({ ...venue, level });
  }
  const { state } = buildTower({
    ...plainTowerPlan(10, 100, 199),
    units,
    shafts: [{ type: 'standard', x: 100, bottom: 1, top: 10 }],
  });
  for (const unit of Object.values(state.units)) {
    if (unit.type === 'retail-shop')
      unit.lease = { anchorStep: 0, nextDueStep: 30 * STEPS_PER_DAY, weekVisits: 0 };
  }
  return state;
}

function timeOneDay(systems: readonly SimulationSystem[]): number {
  const engine = createEngine({ commandHandlers: {}, systems });
  const tower = venueTower();
  tower.step = STEPS_PER_DAY - 1;
  return fastestRunMillis(() => engine.step(tower, [], STEPS_PER_DAY));
}

/**
 * Milliseconds per step that a weekday of outside customers adds to walking and riding in the
 * venue tower: the day with customers minus the same day without them, fastest of three each.
 */
export function customerStepMillis(): { withCustomers: number; without: number; added: number } {
  const customers = createCustomers();
  const withCustomers = timeOneDay([
    createScheduler([customers.planHook, customers.nightHook]),
    customers.system,
    createTrekSystem(),
    createElevatorSystem(),
  ]);
  const without = timeOneDay([createTrekSystem(), createElevatorSystem()]);
  return {
    withCustomers: withCustomers / STEPS_PER_DAY,
    without: without / STEPS_PER_DAY,
    added: Math.max(0, withCustomers - without) / STEPS_PER_DAY,
  };
}
