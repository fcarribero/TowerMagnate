import {
  ESCALATOR_FLIGHT_STEPS,
  MAX_ESCALATOR_FLOORS_PER_TRIP,
  MAX_STAIR_FLOORS_PER_TRIP,
  PERSON_KINDS,
  STAIR_FLIGHT_STEPS,
  WALK_COLUMNS_PER_STEP,
  type EntityId,
  type HallDirection,
  type Level,
  type PersonPool,
} from '@tower-magnate/shared';
import { isQueueFull, joinQueue, nextQueueCheckStep } from './elevator-queues';
import { parsePersonId, personEntityId, slotOfPerson } from './people';
import { floorIndex } from './routing/transport-graph';
import {
  spendBudget,
  TransportGraph,
  TripPlanner,
  type FirstLeg,
  type RoutePlan,
  type TripBudget,
} from './routing';
import type { SimulationSystem, StepContext } from './step';

/** What a person on a trip is doing, stored in the pool as the index into this list. */
export const TREK_PHASES = [
  'idle',
  'walkingToDestination',
  'walkingToStairs',
  'walkingToEscalator',
  'walkingToShaft',
  'onStairs',
  'onEscalator',
  'queued',
  'waitingBesideQueue',
  'riding',
] as const;

export type TrekPhase = (typeof TREK_PHASES)[number];

const IDLE = TREK_PHASES.indexOf('idle');
const WALKING_TO_DESTINATION = TREK_PHASES.indexOf('walkingToDestination');
const WALKING_TO_STAIRS = TREK_PHASES.indexOf('walkingToStairs');
const WALKING_TO_ESCALATOR = TREK_PHASES.indexOf('walkingToEscalator');
const WALKING_TO_SHAFT = TREK_PHASES.indexOf('walkingToShaft');
const ON_STAIRS = TREK_PHASES.indexOf('onStairs');
const ON_ESCALATOR = TREK_PHASES.indexOf('onEscalator');
const QUEUED = TREK_PHASES.indexOf('queued');
const WAITING_BESIDE_QUEUE = TREK_PHASES.indexOf('waitingBesideQueue');
const RIDING = TREK_PHASES.indexOf('riding');

const MAID_KIND = PERSON_KINDS.indexOf('maid');

export interface TrekPlace {
  level: Level;
  column: number;
}

export function trekPhaseAt(pool: PersonPool, slot: number): TrekPhase {
  return TREK_PHASES[pool.trek[slot] ?? IDLE] ?? 'idle';
}

export function isOnTrek(pool: PersonPool, slot: number): boolean {
  return (pool.trek[slot] ?? IDLE) !== IDLE;
}

const STAIR_RANGE = MAX_STAIR_FLOORS_PER_TRIP + 1;
const ESCALATOR_RANGE = MAX_ESCALATOR_FLOORS_PER_TRIP + 1;

function packBudget(budget: TripBudget): number {
  return (
    (budget.rides * ESCALATOR_RANGE + budget.escalatorFloors) * STAIR_RANGE + budget.stairFloors
  );
}

function unpackBudget(packed: number): TripBudget {
  const rest = Math.floor(packed / STAIR_RANGE);
  return {
    stairFloors: packed % STAIR_RANGE,
    escalatorFloors: rest % ESCALATOR_RANGE,
    rides: Math.floor(rest / ESCALATOR_RANGE),
  };
}

/** Planners are kept per graph: a rebuilt graph is a new object and starts with an empty cache. */
const planners = new WeakMap<TransportGraph, TripPlanner>();

function plannerFor(graph: TransportGraph): TripPlanner {
  let planner = planners.get(graph);
  if (!planner) {
    planner = new TripPlanner(graph);
    planners.set(graph, planner);
  }
  return planner;
}

function graphOf(context: StepContext): TransportGraph {
  context.graph ??= new TransportGraph(context.state);
  return context.graph;
}

function directionBetween(from: Level, to: Level): HallDirection {
  return floorIndex(to) > floorIndex(from) ? 'up' : 'down';
}

function planFrom(context: StepContext, slot: number): RoutePlan | null {
  const pool = context.state.people;
  const userClass = pool.kind[slot] === MAID_KIND ? 'maid' : 'other';
  return plannerFor(graphOf(context)).plan(context.state, {
    from: { level: pool.level[slot] as Level, x: pool.column[slot] as number },
    to: { level: pool.trekLevel[slot] as Level, x: pool.trekColumn[slot] as number },
    userClass,
    budget: unpackBudget(pool.trekBudget[slot] as number),
  });
}

function setLeg(
  pool: PersonPool,
  slot: number,
  phase: number,
  leg: { via: number; level: Level; column: number },
): void {
  pool.trek[slot] = phase;
  pool.legVia[slot] = leg.via;
  pool.legLevel[slot] = leg.level;
  pool.legColumn[slot] = leg.column;
}

function entityNumber(id: string): number {
  return Number(id.slice(1));
}

function startLeg(context: StepContext, slot: number, leg: FirstLeg): void {
  const graph = graphOf(context);
  const first = leg.steps[0];
  if (!first) throw new Error('A transport leg has at least one step');
  const from = graph.node(first.from);
  const to = graph.node(first.to);
  const phase =
    leg.kind === 'stairs'
      ? WALKING_TO_STAIRS
      : leg.kind === 'escalator'
        ? WALKING_TO_ESCALATOR
        : WALKING_TO_SHAFT;
  setLeg(context.state.people, slot, phase, {
    via: entityNumber(first.via),
    level: to.level,
    column: from.x,
  });
}

/**
 * Plans the next leg from where the person stands and starts it (routing 5.1). The person ends
 * idle when there is no route. A leg that starts where the person already is begins at once.
 */
function planNextLeg(context: StepContext, slot: number): boolean {
  const pool = context.state.people;
  const plan = planFrom(context, slot);
  if (!plan) {
    pool.trek[slot] = IDLE;
    return false;
  }
  if (plan.firstLeg) {
    startLeg(context, slot, plan.firstLeg);
  } else {
    setLeg(pool, slot, WALKING_TO_DESTINATION, {
      via: 0,
      level: pool.trekLevel[slot] as Level,
      column: pool.trekColumn[slot] as number,
    });
  }
  if (pool.column[slot] === pool.legColumn[slot]) reachLegStart(context, slot);
  return true;
}

/**
 * Sends a person on a trip to `to` with an empty budget. Returns false, and changes nothing,
 * when no route exists. When the person gets there, their due step is set to that step.
 */
export function startTrek(context: StepContext, slot: number, to: TrekPlace): boolean {
  const pool = context.state.people;
  pool.trekLevel[slot] = to.level;
  pool.trekColumn[slot] = to.column;
  pool.trekBudget[slot] = packBudget({ stairFloors: 0, escalatorFloors: 0, rides: 0 });
  const started = planNextLeg(context, slot);
  if (!started) clearTrek(pool, slot);
  return started;
}

/**
 * Estimated steps of a trip, for choosing between venues and for giving up on a trip that would
 * end after leave time; null when no route exists. The trek itself decides the real time.
 */
export function plannedTripSteps(
  context: StepContext,
  from: TrekPlace,
  to: TrekPlace,
): number | null {
  const plan = plannerFor(graphOf(context)).plan(context.state, {
    from: { level: from.level, x: from.column },
    to: { level: to.level, x: to.column },
    userClass: 'other',
  });
  if (!plan) return null;
  const stairs = plan.firstLeg?.steps.length ?? 0;
  return plan.columnsWalked + stairs * STAIR_FLIGHT_STEPS + plan.transportLegs;
}

/** Ends the trip wherever the person stands. */
export function cancelTrek(context: StepContext, slot: number): void {
  const pool = context.state.people;
  if (pool.trek[slot] === QUEUED) leaveQueueOf(context, slot);
  if (pool.trek[slot] === RIDING) leaveCarOf(context, slot);
  clearTrek(pool, slot);
}

function leaveQueueOf(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[`s${pool.legVia[slot]}`];
  if (!shaft) return;
  const direction = directionBetween(pool.level[slot] as Level, pool.legLevel[slot] as Level);
  const queue = shaft.queues[String(pool.level[slot])]?.[direction];
  if (!queue) return;
  const person = personEntityId(pool.id[slot] as number);
  const at = queue.findIndex((entry) => entry.person === person);
  if (at >= 0) queue.splice(at, 1);
}

function leaveCarOf(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[`s${pool.legVia[slot]}`];
  if (!shaft) return;
  const person = personEntityId(pool.id[slot] as number);
  for (const car of shaft.cars) {
    const at = car.riders.indexOf(person);
    if (at < 0) continue;
    car.riders.splice(at, 1);
    car.trips.splice(at, 1);
    return;
  }
}

function clearTrek(pool: PersonPool, slot: number): void {
  pool.trek[slot] = IDLE;
  pool.trekLevel[slot] = 0;
  pool.trekColumn[slot] = 0;
  pool.trekBudget[slot] = 0;
  pool.legVia[slot] = 0;
  pool.legLevel[slot] = 0;
  pool.legColumn[slot] = 0;
  pool.legStep[slot] = 0;
}

function arrive(context: StepContext, slot: number): void {
  const pool = context.state.people;
  clearTrek(pool, slot);
  pool.dueStep[slot] = context.state.step;
}

function flightExists(context: StepContext, slot: number): boolean {
  return Object.hasOwn(context.state.transports, `t${context.state.people.legVia[slot]}`);
}

function startFlight(context: StepContext, slot: number, phase: number, steps: number): void {
  const pool = context.state.people;
  pool.trek[slot] = phase;
  pool.legStep[slot] = context.state.step + steps;
}

function enterQueueOrWait(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  const shaft = state.shafts[`s${pool.legVia[slot]}`];
  if (!shaft) {
    planNextLeg(context, slot);
    return;
  }
  const level = pool.level[slot] as Level;
  const destination = pool.legLevel[slot] as Level;
  const direction = directionBetween(level, destination);
  if (isQueueFull(shaft, level, direction)) {
    pool.trek[slot] = WAITING_BESIDE_QUEUE;
    pool.legStep[slot] = nextQueueCheckStep(state.step);
    return;
  }
  const person = personEntityId(pool.id[slot] as number);
  joinQueue(shaft, level, direction, person, destination, state.step);
  pool.trek[slot] = QUEUED;
}

/** The person is standing where their current leg begins. */
function reachLegStart(context: StepContext, slot: number): void {
  const phase = context.state.people.trek[slot];
  if (phase === WALKING_TO_DESTINATION) {
    arrive(context, slot);
  } else if (phase === WALKING_TO_STAIRS || phase === WALKING_TO_ESCALATOR) {
    const onStairs = phase === WALKING_TO_STAIRS;
    if (!flightExists(context, slot)) planNextLeg(context, slot);
    else if (onStairs) startFlight(context, slot, ON_STAIRS, STAIR_FLIGHT_STEPS);
    else startFlight(context, slot, ON_ESCALATOR, ESCALATOR_FLIGHT_STEPS);
  } else {
    enterQueueOrWait(context, slot);
  }
}

function slotOfEntity(context: StepContext, person: EntityId): number {
  const id = parsePersonId(person);
  return id === null ? -1 : slotOfPerson(context.state.people, id);
}

/** A queued person has stepped into a car: they ride until the car lets them out. */
export function boardRider(context: StepContext, person: EntityId): void {
  const slot = slotOfEntity(context, person);
  if (slot >= 0 && context.state.people.trek[slot] === QUEUED) {
    context.state.people.trek[slot] = RIDING;
  }
}

/** A rider is let out at `level`: the ride counts toward the budget and the route goes on from there. */
export function alightRider(context: StepContext, person: EntityId, level: Level): void {
  const slot = slotOfEntity(context, person);
  const pool = context.state.people;
  if (slot < 0 || pool.trek[slot] !== RIDING) return;
  const budget = unpackBudget(pool.trekBudget[slot] as number);
  const ride = { kind: 'standard', via: '', from: 0, to: 0, floors: 1 } as const;
  pool.trekBudget[slot] = packBudget(spendBudget(budget, ride));
  pool.level[slot] = level;
  planNextLeg(context, slot);
}

function finishFlight(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const kind = pool.trek[slot] === ON_STAIRS ? 'stairs' : 'escalator';
  const budget = unpackBudget(pool.trekBudget[slot] as number);
  const flight = { kind, via: '', from: 0, to: 0, floors: 1 } as const;
  pool.trekBudget[slot] = packBudget(spendBudget(budget, flight));
  pool.level[slot] = pool.legLevel[slot] as number;
  planNextLeg(context, slot);
}

/** Moves one column toward the leg's column; true when the person is there. */
function walk(pool: PersonPool, slot: number): boolean {
  const column = pool.column[slot] as number;
  const target = pool.legColumn[slot] as number;
  const distance = Math.min(WALK_COLUMNS_PER_STEP, Math.abs(target - column));
  pool.column[slot] = column + Math.sign(target - column) * distance;
  return pool.column[slot] === target;
}

function stepPerson(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const phase = pool.trek[slot] as number;
  if (phase === IDLE || phase === QUEUED || phase === RIDING) return;
  if (phase <= WALKING_TO_SHAFT) {
    if (walk(pool, slot)) reachLegStart(context, slot);
  } else if (pool.legStep[slot] === context.state.step) {
    if (phase === WAITING_BESIDE_QUEUE) planNextLeg(context, slot);
    else finishFlight(context, slot);
  }
}

/**
 * Moves everyone on a trip by one step, in increasing person id: one column of walking, the end
 * of a stair or escalator flight, or a fresh look at a full queue (routing 8.1 to 8.3).
 */
export function createTrekSystem(): SimulationSystem {
  return (context) => {
    const pool = context.state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      stepPerson(context, slot);
    }
  };
}
