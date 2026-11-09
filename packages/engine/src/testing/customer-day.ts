import type { TowerState, UnitType } from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';
import { createCustomers } from '../customers';
import { createElevatorSystem } from '../elevators';
import { createScheduler } from '../scheduler';
import { createEngine, type SimulationSystem } from '../step';
import { createTrekSystem } from '../trek';
import { fastestRunMillis } from './fastest-run';
import {
  buildTower,
  plainTowerPlan,
  type PlannedShaft,
  type PlannedUnit,
  type TowerPlan,
} from './tower-builder';

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

/** Budget for what the subway entrance adds to one step of the customer day, in milliseconds. */
export const MAX_SUBWAY_STEP_MS = 0.05;

const STATION_X = 110;

function letAllShops(state: TowerState): void {
  for (const unit of Object.values(state.units)) {
    if (unit.type === 'retail-shop')
      unit.lease = { anchorStep: 0, nextDueStep: 30 * STEPS_PER_DAY, weekVisits: 0 };
  }
}

export interface VenueTowerOptions {
  station?: boolean;
  secondElevator?: boolean;
}

/**
 * Ten floors with a fast food, a restaurant and four let shops on each of levels 2..10. With a
 * station, the basements down to -9 have floors and a shuttle elevator runs from -7 to the lobby.
 */
export function venueTower(options: VenueTowerOptions = {}): TowerState {
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= 10; level++) {
    for (const venue of FLOOR_LAYOUT) units.push({ ...venue, level });
  }
  const shafts: PlannedShaft[] = [{ type: 'standard', x: 100, bottom: 1, top: 10 }];
  if (options.secondElevator) shafts.push({ type: 'standard', x: 194, bottom: 1, top: 10 });
  const plan: TowerPlan = { ...plainTowerPlan(10, 100, 199), units, shafts };
  if (options.station) {
    plan.floors = [...(plan.floors ?? []), { from: -9, to: -1, x0: 100, x1: 199 }];
    units.push({ type: 'subway-station', x: STATION_X, level: -9 });
    shafts.push({ type: 'standard', x: 150, bottom: -7, top: 1 });
  }
  const { state } = buildTower(plan);
  letAllShops(state);
  return state;
}

/** The customer systems in the order the tower engine runs them: treks end before customers act. */
function customerSystems(): SimulationSystem[] {
  const customers = createCustomers();
  return [
    createScheduler([customers.planHook, customers.nightHook]),
    createTrekSystem(),
    customers.system,
    createElevatorSystem(),
  ];
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
  const withCustomers = timeOneDay(customerSystems());
  const without = timeOneDay([createTrekSystem(), createElevatorSystem()]);
  return {
    withCustomers: withCustomers / STEPS_PER_DAY,
    without: without / STEPS_PER_DAY,
    added: Math.max(0, withCustomers - without) / STEPS_PER_DAY,
  };
}

export interface SubwayStepTiming {
  withSubway: number;
  without: number;
  added: number;
  peakPeople: number;
}

/** The station tower right after its 00:00 plan, and the same plan in the tower without it. */
function plannedTowers(): { withSubway: TowerState; without: TowerState } {
  const engine = createEngine({ commandHandlers: {}, systems: customerSystems() });
  const start = venueTower({ station: true, secondElevator: true });
  start.step = STEPS_PER_DAY - 1;
  const withSubway = engine.step(start, [], 1).state;
  const without = venueTower({ secondElevator: true });
  without.step = withSubway.step;
  for (const unit of Object.values(without.units)) {
    const planned = withSubway.units[unit.id]?.venue;
    if (unit.venue && planned) unit.venue = structuredClone(planned);
  }
  return { withSubway, without };
}

function peakPeopleOfDay(tower: TowerState): number {
  const engine = createEngine({ commandHandlers: {}, systems: customerSystems() });
  let state = tower;
  let peak = 0;
  for (let hour = 0; hour < 24; hour++) {
    state = engine.step(state, [], STEPS_PER_DAY / 24).state;
    peak = Math.max(peak, state.people.id.length);
  }
  return peak;
}

/**
 * Milliseconds per step that the subway entrance adds to a weekday of outside customers: the
 * station tower minus the same customer plan in the tower without a station, fastest of three.
 */
export function subwayStepMillis(): SubwayStepTiming {
  const { withSubway, without } = plannedTowers();
  const steps = STEPS_PER_DAY - 1;
  const time = (tower: TowerState) => {
    const engine = createEngine({ commandHandlers: {}, systems: customerSystems() });
    return fastestRunMillis(() => engine.step(tower, [], steps)) / steps;
  };
  const withMillis = time(withSubway);
  const withoutMillis = time(without);
  return {
    withSubway: withMillis,
    without: withoutMillis,
    added: Math.max(0, withMillis - withoutMillis),
    peakPeople: peakPeopleOfDay(withSubway),
  };
}
