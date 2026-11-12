import {
  ESCALATOR_FLIGHT_STEPS,
  FULL_QUEUE_MAX_SWITCHES_PER_TRIP,
  FULL_QUEUE_STAY_RECHECKS,
  FULL_QUEUE_SWITCH_MARGIN,
  LAST_COLUMN,
  LOWEST_LEVEL,
  MAX_ESCALATOR_FLOORS_PER_TRIP,
  MAX_RIDES_PER_TRIP,
  MAX_STAIR_FLOORS_PER_TRIP,
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  STAIR_FLIGHT_STEPS,
  WALK_COLUMNS_PER_STEP,
  type EntityId,
  type HallDirection,
  type Level,
  type PersonPool,
  type Shaft,
} from '@tower-magnate/shared';
import { isQueueFull, joinQueue, nextQueueCheckStep } from './elevator-queues';
import {
  addFailedSearch,
  addFlight,
  addFullQueueEvent,
  boardCar,
  finishRide,
  lobbyHeightAt,
  recordTrip,
  refreshPersonStress,
  settlePartUnderWay,
  startWait,
  type PartUnderWay,
} from './trip-ledger';
import { parsePersonId, personEntityId, slotOfPerson } from './people';
import { floorIndex } from './routing/transport-graph';
import {
  spendBudget,
  TransportGraph,
  TripPlanner,
  type FirstLeg,
  type RoutePlan,
  type RecheckPlan,
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
  'noRoute',
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
const NO_ROUTE = TREK_PHASES.indexOf('noRoute');

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
const BUDGET_RANGE = (MAX_RIDES_PER_TRIP + 1) * ESCALATOR_RANGE * STAIR_RANGE;

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

/** The queue a ride starts from and where it goes. */
interface Ride {
  via: number;
  fromLevel: number;
  fromColumn: number;
  level: number;
}

/** What a recheck found, and the ride the alternative route starts with when it is a ride. */
interface RecheckResult {
  found: RecheckPlan | null;
  ride: Ride | null;
}

/**
 * Plans made by people looking again at a full queue during one trek pass, by destination group
 * and then by start and budget. A plan depends on the queues only through which ones are full.
 * A queue that fills up only makes the rides from it costlier, so only the plans that ride from
 * it are forgotten; a queue that stops being full forgets them all. A recheck uses only the
 * plan's first leg, which is the same for every destination of a group.
 */
interface TrekPass {
  planner: TripPlanner;
  /** Lobby height by `placeKey`; the grid does not change during a trek pass. */
  lobbyHeights: Map<number, number | null>;
  plans: Map<number, Map<number, RecheckResult>>;
}

const trekPasses = new WeakMap<StepContext, TrekPass>();

const COLUMN_SPAN = LAST_COLUMN + 1;

/** One small integer per cell of the site. */
function placeKey(level: number, column: number): number {
  return (level - LOWEST_LEVEL) * COLUMN_SPAN + column;
}

function recheckStart(pool: PersonPool, slot: number): number {
  const place = placeKey(pool.level[slot] as number, pool.column[slot] as number);
  return place * BUDGET_RANGE + (pool.trekBudget[slot] as number);
}

function destinationGroupOf(pass: TrekPass, pool: PersonPool, slot: number): number | null {
  const to = { level: pool.trekLevel[slot] as Level, x: pool.trekColumn[slot] as number };
  return pass.planner.destinationGroup(to, pool.kind[slot] === MAID_KIND ? 'maid' : 'other');
}

function rideOf(context: StepContext, plan: RoutePlan | null): Ride | null {
  const leg = plan?.firstLeg;
  const first = leg?.steps[0];
  if (leg?.kind !== 'ride' || !first) return null;
  const graph = graphOf(context);
  const from = graph.node(first.from);
  return {
    via: entityNumber(first.via),
    fromLevel: from.level,
    fromColumn: from.x,
    level: graph.node(first.to).level,
  };
}

function recheckFrom(
  context: StepContext,
  slot: number,
  leftShafts: readonly number[],
): RecheckResult {
  const pool = context.state.people;
  const userClass = pool.kind[slot] === MAID_KIND ? 'maid' : 'other';
  const found = plannerFor(graphOf(context)).planRecheck(
    context.state,
    {
      from: { level: pool.level[slot] as Level, x: pool.column[slot] as number },
      to: { level: pool.trekLevel[slot] as Level, x: pool.trekColumn[slot] as number },
      userClass,
      budget: unpackBudget(pool.trekBudget[slot] as number),
    },
    {
      via: pool.legVia[slot] as number,
      toLevel: pool.legLevel[slot] as Level,
      column: pool.column[slot] as number,
    },
    leftShafts,
  );
  return { found, ride: rideOf(context, found?.alternative ?? null) };
}

/**
 * People who left no shaft and wait for the same ride from the same place with the same budget
 * find the same thing, so they share one search. The others search for themselves.
 */
function recheckFor(context: StepContext, slot: number, pass: TrekPass): RecheckResult {
  const pool = context.state.people;
  const leftShafts = leftShaftsOf(pool, slot);
  const group = destinationGroupOf(pass, pool, slot);
  if (group === null || leftShafts.length > 0) return recheckFrom(context, slot, leftShafts);
  let byStart = pass.plans.get(group);
  if (!byStart) {
    byStart = new Map();
    pass.plans.set(group, byStart);
  }
  const start = recheckStart(pool, slot);
  let known = byStart.get(start);
  if (!known) {
    known = recheckFrom(context, slot, leftShafts);
    byStart.set(start, known);
  }
  return known;
}

const SHAFT_NUMBER_RANGE = 1 << 20;

function leftShaftsOf(pool: PersonPool, slot: number): number[] {
  const packed = pool.leftShafts[slot] as number;
  const first = packed % SHAFT_NUMBER_RANGE;
  const second = Math.floor(packed / SHAFT_NUMBER_RANGE);
  return [first, second].filter((via) => via > 0);
}

function addLeftShaft(pool: PersonPool, slot: number, via: number): void {
  const [first = 0] = leftShaftsOf(pool, slot);
  pool.leftShafts[slot] = first === 0 ? via : first + via * SHAFT_NUMBER_RANGE;
}

/** Routing 8.4: a re-plan keeps the switch count and forgets the shafts the person left. */
function forgetLeftShafts(pool: PersonPool, slot: number): void {
  pool.leftShafts[slot] = 0;
}

/** Height of the lobby a person stands in, or null outside a lobby. */
function lobbyHeightHere(context: StepContext, level: Level, column: number): number | null {
  const pass = trekPasses.get(context);
  if (!pass) return lobbyHeightAt(context.state.grid, level, column);
  const key = placeKey(level, column);
  let height = pass.lobbyHeights.get(key);
  if (height === undefined) {
    height = lobbyHeightAt(context.state.grid, level, column);
    pass.lobbyHeights.set(key, height);
  }
  return height;
}

function forgetRecheckPlans(context: StepContext): void {
  trekPasses.get(context)?.plans.clear();
}

function ridesFromQueue(ride: Ride | null, via: number, level: Level, direction: HallDirection) {
  return (
    ride !== null &&
    ride.via === via &&
    ride.fromLevel === level &&
    directionBetween(level, ride.level as Level) === direction
  );
}

function forgetPlansRidingFrom(
  context: StepContext,
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
): void {
  const pass = trekPasses.get(context);
  if (!pass) return;
  const via = entityNumber(shaft.id);
  for (const byStart of pass.plans.values()) {
    for (const [start, known] of byStart) {
      if (ridesFromQueue(known.ride, via, level, direction)) byStart.delete(start);
    }
  }
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

/** Ids built once per number: a trek pass looks up the same few shafts thousands of times. */
const shaftKeys = new Map<number, string>();
const transportKeys = new Map<number, string>();

function shaftKey(via: number): string {
  let key = shaftKeys.get(via);
  if (key === undefined) {
    key = `s${via}`;
    shaftKeys.set(via, key);
  }
  return key;
}

function transportKey(via: number): string {
  let key = transportKeys.get(via);
  if (key === undefined) {
    key = `t${via}`;
    transportKeys.set(via, key);
  }
  return key;
}

interface LegStart {
  phase: number;
  via: number;
  level: Level;
  column: number;
}

/** Plans are shared by everyone who rechecks the same way, so each leg is read once. */
const legStarts = new WeakMap<FirstLeg, LegStart>();

function legStartOf(context: StepContext, leg: FirstLeg): LegStart {
  let start = legStarts.get(leg);
  if (start) return start;
  const graph = graphOf(context);
  const first = leg.steps[0];
  if (!first) throw new Error('A transport leg has at least one step');
  const phase =
    leg.kind === 'stairs'
      ? WALKING_TO_STAIRS
      : leg.kind === 'escalator'
        ? WALKING_TO_ESCALATOR
        : WALKING_TO_SHAFT;
  start = {
    phase,
    via: entityNumber(first.via),
    level: graph.node(first.to).level,
    column: graph.node(first.from).x,
  };
  legStarts.set(leg, start);
  return start;
}

function startLeg(context: StepContext, slot: number, leg: FirstLeg): void {
  const start = legStartOf(context, leg);
  setLeg(context.state.people, slot, start.phase, start);
}

/**
 * Plans the next leg from where the person stands and starts it (routing 5.1). The person ends
 * idle when there is no route. A leg that starts where the person already is begins at once.
 */
function planNextLeg(
  context: StepContext,
  slot: number,
  plan: RoutePlan | null = planFrom(context, slot),
): boolean {
  const pool = context.state.people;
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

function entityOf(pool: PersonPool, slot: number): EntityId {
  return personEntityId(pool.id[slot] as number);
}

/**
 * Plans again in the middle of a trip. With no route the person stays where they are and searches
 * again after ROUTE_RETRY_STEPS, and the failed search is reported for stress (routing R-23).
 */
function replan(
  context: StepContext,
  slot: number,
  plan: RoutePlan | null = planFrom(context, slot),
): void {
  if (planNextLeg(context, slot, plan)) return;
  const pool = context.state.people;
  pool.trek[slot] = NO_ROUTE;
  pool.legStep[slot] = context.state.step + ROUTE_RETRY_STEPS;
  addFailedSearch(pool, slot);
  context.events.push({
    type: 'routeSearchFailed',
    step: context.state.step,
    person: entityOf(pool, slot),
  });
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
  else if (isOnTrek(pool, slot)) refreshPersonStress(context.state, slot, true);
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

/**
 * Ends the trip wherever the person stands and records what it has. The night reset adds one
 * more failed attempt to it.
 */
export function cancelTrek(
  context: StepContext,
  slot: number,
  options: { nightReset?: boolean } = {},
): void {
  const pool = context.state.people;
  settlePartUnderWay(context.state, slot, partUnderWay(pool.trek[slot] as number));
  if (pool.trek[slot] === QUEUED) leaveQueueOf(context, slot);
  if (pool.trek[slot] === RIDING) leaveCarOf(context, slot);
  clearTrek(pool, slot);
  recordTrip(context.state, slot, options);
  reportTripFinished(context, slot, false);
}

function partUnderWay(phase: number): PartUnderWay {
  if (phase === QUEUED || phase === WAITING_BESIDE_QUEUE) return 'queued';
  if (phase === RIDING) return 'riding';
  return null;
}

function reportTripFinished(context: StepContext, slot: number, arrived: boolean): void {
  context.events.push({
    type: 'tripFinished',
    step: context.state.step,
    person: entityOf(context.state.people, slot),
    arrived,
  });
}

function leaveQueueOf(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[slot] as number)];
  if (!shaft) return;
  const direction = directionBetween(pool.level[slot] as Level, pool.legLevel[slot] as Level);
  const queue = shaft.queues[String(pool.level[slot])]?.[direction];
  if (!queue) return;
  const person = personEntityId(pool.id[slot] as number);
  const at = queue.findIndex((entry) => entry.person === person);
  if (at < 0) return;
  const wasFull = isQueueFull(shaft, pool.level[slot] as Level, direction);
  queue.splice(at, 1);
  if (wasFull) forgetRecheckPlans(context);
}

function leaveCarOf(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[slot] as number)];
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
  pool.tripSwitches[slot] = 0;
  pool.queueRechecks[slot] = 0;
  pool.leftShafts[slot] = 0;
}

function arrive(context: StepContext, slot: number): void {
  const pool = context.state.people;
  clearTrek(pool, slot);
  recordTrip(context.state, slot);
  pool.dueStep[slot] = context.state.step;
  reportTripFinished(context, slot, true);
}

function flightExists(context: StepContext, slot: number): boolean {
  return Object.hasOwn(
    context.state.transports,
    transportKey(context.state.people.legVia[slot] as number),
  );
}

function startFlight(context: StepContext, slot: number, phase: number, steps: number): void {
  const pool = context.state.people;
  pool.trek[slot] = phase;
  pool.legStep[slot] = context.state.step + steps;
}

function joinQueueAt(
  context: StepContext,
  slot: number,
  shaft: Shaft,
  direction: HallDirection,
): void {
  const pool = context.state.people;
  const level = pool.level[slot] as Level;
  const person = personEntityId(pool.id[slot] as number);
  joinQueue(shaft, level, direction, person, pool.legLevel[slot] as Level, context.state.step);
  if (isQueueFull(shaft, level, direction)) forgetPlansRidingFrom(context, shaft, level, direction);
}

function enterQueueOrWait(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  const shaft = state.shafts[shaftKey(pool.legVia[slot] as number)];
  if (!shaft) {
    forgetLeftShafts(pool, slot);
    replan(context, slot);
    return;
  }
  const level = pool.level[slot] as Level;
  const destination = pool.legLevel[slot] as Level;
  const direction = directionBetween(level, destination);
  if (isQueueFull(shaft, level, direction)) {
    pool.trek[slot] = WAITING_BESIDE_QUEUE;
    pool.queueRechecks[slot] = 0;
    pool.legStep[slot] = nextQueueCheckStep(state.step);
    startWait(state, slot, direction, lobbyHeightHere(context, level, shaft.x));
    addFullQueueEvent(pool, slot);
    return;
  }
  joinQueueAt(context, slot, shaft, direction);
  startWait(state, slot, direction, lobbyHeightHere(context, level, shaft.x));
  pool.trek[slot] = QUEUED;
}

function joinFromBesideQueue(context: StepContext, slot: number): boolean {
  const { state } = context;
  const pool = state.people;
  const shaft = state.shafts[shaftKey(pool.legVia[slot] as number)];
  const level = pool.level[slot] as Level;
  const direction = directionBetween(level, pool.legLevel[slot] as Level);
  if (!shaft || isQueueFull(shaft, level, direction)) return false;
  joinQueueAt(context, slot, shaft, direction);
  pool.trek[slot] = QUEUED;
  return true;
}

function queueOfRideHasRoom(context: StepContext, ride: Ride): boolean {
  const shaft = context.state.shafts[shaftKey(ride.via)];
  if (!shaft) return false;
  const level = ride.fromLevel as Level;
  return !isQueueFull(shaft, level, directionBetween(level, ride.level as Level));
}

/** The route to switch to, or null when a condition of routing 8.3 step 3 fails. */
function switchTarget(context: StepContext, slot: number, pass: TrekPass): RoutePlan | null {
  const { found, ride } = recheckFor(context, slot, pass);
  const alternative = found?.alternative;
  if (!found || !alternative) return null;
  if (alternative.cost > found.stayCost - FULL_QUEUE_SWITCH_MARGIN) return null;
  if (ride && !queueOfRideHasRoom(context, ride)) return null;
  return alternative;
}

function mayLookForAnotherRide(pool: PersonPool, slot: number): boolean {
  return (
    (pool.queueRechecks[slot] as number) >= FULL_QUEUE_STAY_RECHECKS &&
    (pool.tripSwitches[slot] as number) < FULL_QUEUE_MAX_SWITCHES_PER_TRIP
  );
}

function switchRide(context: StepContext, slot: number, target: RoutePlan): void {
  const pool = context.state.people;
  addLeftShaft(pool, slot, pool.legVia[slot] as number);
  pool.tripSwitches[slot] = (pool.tripSwitches[slot] as number) + 1;
  settlePartUnderWay(context.state, slot, 'queued');
  replan(context, slot, target);
}

/**
 * A person beside a full queue looks again once a game minute (routing 8.3). They join when
 * there is room. After three rechecks at the same shaft they may switch to a clearly cheaper ride
 * at a shaft they did not leave, at most twice in a trip; otherwise they keep waiting.
 */
function recheckFullQueue(context: StepContext, slot: number, pass: TrekPass): void {
  const { state } = context;
  const pool = state.people;
  if (!state.shafts[shaftKey(pool.legVia[slot] as number)]) {
    forgetLeftShafts(pool, slot);
    replan(context, slot);
    return;
  }
  if (joinFromBesideQueue(context, slot)) return;
  pool.queueRechecks[slot] = Math.min(
    (pool.queueRechecks[slot] as number) + 1,
    FULL_QUEUE_STAY_RECHECKS,
  );
  const target = mayLookForAnotherRide(pool, slot) ? switchTarget(context, slot, pass) : null;
  if (target) switchRide(context, slot, target);
  else pool.legStep[slot] = nextQueueCheckStep(state.step);
}

/** The person is standing where their current leg begins. */
function reachLegStart(context: StepContext, slot: number): void {
  const phase = context.state.people.trek[slot];
  if (phase === WALKING_TO_DESTINATION) {
    arrive(context, slot);
  } else if (phase === WALKING_TO_STAIRS || phase === WALKING_TO_ESCALATOR) {
    const onStairs = phase === WALKING_TO_STAIRS;
    if (!flightExists(context, slot)) {
      forgetLeftShafts(context.state.people, slot);
      replan(context, slot);
    } else if (onStairs) startFlight(context, slot, ON_STAIRS, STAIR_FLIGHT_STEPS);
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
    boardCar(context.state, slot);
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
  finishRide(
    context.state,
    slot,
    context.state.shafts[shaftKey(pool.legVia[slot] as number)],
    level,
  );
  pool.level[slot] = level;
  replan(context, slot);
}

function finishFlight(context: StepContext, slot: number): void {
  const pool = context.state.people;
  const kind = pool.trek[slot] === ON_STAIRS ? 'stairs' : 'escalator';
  const budget = unpackBudget(pool.trekBudget[slot] as number);
  const flight = { kind, via: '', from: 0, to: 0, floors: 1 } as const;
  pool.trekBudget[slot] = packBudget(spendBudget(budget, flight));
  addFlight(pool, slot, kind);
  pool.level[slot] = pool.legLevel[slot] as number;
  replan(context, slot);
}

/** Moves one column toward the leg's column; true when the person is there. */
function walk(pool: PersonPool, slot: number): boolean {
  const column = pool.column[slot] as number;
  const target = pool.legColumn[slot] as number;
  const distance = Math.min(WALK_COLUMNS_PER_STEP, Math.abs(target - column));
  pool.column[slot] = column + Math.sign(target - column) * distance;
  if (distance > 0) pool.facing[slot] = target < column ? 1 : 0;
  return pool.column[slot] === target;
}

function usesShaft(phase: number): boolean {
  return phase === WALKING_TO_SHAFT || phase === QUEUED || phase === WAITING_BESIDE_QUEUE;
}

function usesFlight(phase: number): boolean {
  return (
    phase === WALKING_TO_STAIRS ||
    phase === WALKING_TO_ESCALATOR ||
    phase === ON_STAIRS ||
    phase === ON_ESCALATOR
  );
}

function shaftStillServes(context: StepContext, slot: number): boolean {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[slot] as number)];
  return (
    shaft !== undefined &&
    shaft.cars.length > 0 &&
    shaft.stops.includes(pool.level[slot] as Level) &&
    shaft.stops.includes(pool.legLevel[slot] as Level)
  );
}

function isLegBroken(context: StepContext, slot: number, phase: number): boolean {
  if (usesFlight(phase)) return !flightExists(context, slot);
  return usesShaft(phase) && !shaftStillServes(context, slot);
}

/** Sends everyone whose leg no longer exists to plan again from where they stand (routing 8.4). */
function replanBrokenLegs(context: StepContext): void {
  const pool = context.state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    const phase = pool.trek[slot] as number;
    if (!isLegBroken(context, slot, phase)) continue;
    if (phase === QUEUED) leaveQueueOf(context, slot);
    if (phase === QUEUED || phase === WAITING_BESIDE_QUEUE) {
      settlePartUnderWay(context.state, slot, 'queued');
    }
    if (phase === ON_STAIRS || phase === ON_ESCALATOR) {
      pool.level[slot] = pool.legLevel[slot] as number;
    }
    forgetLeftShafts(pool, slot);
    replan(context, slot);
  }
}

/**
 * The stress so far grows every step in a queue or a car. Anyone else, including a person beside
 * a full queue who looks again once a game minute, is refreshed only when their trip moved on.
 */
function stressMayHaveMoved(
  pool: PersonPool,
  slot: number,
  phaseBefore: number,
  sumBefore: number,
  legStepBefore: number,
): boolean {
  const phase = pool.trek[slot];
  return (
    phase === QUEUED ||
    phase === RIDING ||
    phase !== phaseBefore ||
    pool.tripSum[slot] !== sumBefore ||
    pool.legStep[slot] !== legStepBefore
  );
}

/** Graphs are rebuilt when the tower changes, so each new graph gets one sweep for broken legs. */
const sweptGraphs = new WeakSet<TransportGraph>();

/** The stored stress of a person at a shaft or in a car and what it was computed from. */
interface StressCheckpoint {
  phase: number;
  stress: number;
  tripSum: number;
  partStep: number;
  partCut: number;
  ledger: readonly number[] | undefined;
  /** First step at which the stress can change if none of the above does. */
  holdsUntil: number;
}

/** Checkpoints by person id, kept for the pool of one engine step call. */
const stressCheckpoints = new WeakMap<PersonPool, Map<number, StressCheckpoint>>();

function checkpointsOf(pool: PersonPool): Map<number, StressCheckpoint> {
  let checkpoints = stressCheckpoints.get(pool);
  if (!checkpoints) {
    checkpoints = new Map();
    stressCheckpoints.set(pool, checkpoints);
  }
  return checkpoints;
}

function ledgerOf(context: StepContext, slot: number): readonly number[] | undefined {
  return context.state.tripLedger[String(context.state.people.id[slot])];
}

function stressStillHolds(
  context: StepContext,
  slot: number,
  checkpoint: StressCheckpoint,
): boolean {
  const pool = context.state.people;
  return (
    context.state.step < checkpoint.holdsUntil &&
    pool.trek[slot] === checkpoint.phase &&
    pool.stress[slot] === checkpoint.stress &&
    pool.tripSum[slot] === checkpoint.tripSum &&
    pool.tripPartStep[slot] === checkpoint.partStep &&
    pool.tripPartCut[slot] === checkpoint.partCut &&
    ledgerOf(context, slot) === checkpoint.ledger
  );
}

/**
 * Refreshes the stress of a person on a trip. The stress of a person waiting at a shaft or riding
 * grows by a known amount each step, so it is only recomputed on the step it can change.
 */
function refreshTravellerStress(
  context: StepContext,
  slot: number,
  checkpoints: Map<number, StressCheckpoint>,
): void {
  const pool = context.state.people;
  const phase = pool.trek[slot] as number;
  const part = partUnderWay(phase);
  const steady = phase === QUEUED || phase === RIDING;
  if (!steady) {
    refreshPersonStress(context.state, slot, true, part);
    return;
  }
  const personId = pool.id[slot] as number;
  const checkpoint = checkpoints.get(personId);
  if (checkpoint && stressStillHolds(context, slot, checkpoint)) return;
  const holdsUntil = refreshPersonStress(context.state, slot, true, part);
  checkpoints.set(personId, {
    phase,
    stress: pool.stress[slot] as number,
    tripSum: pool.tripSum[slot] as number,
    partStep: pool.tripPartStep[slot] as number,
    partCut: pool.tripPartCut[slot] as number,
    ledger: ledgerOf(context, slot),
    holdsUntil,
  });
}

/** Phases in which nothing happens until the leg step: flights, a full queue, no route. */
function waitsForLegStep(phase: number): boolean {
  return phase > WALKING_TO_SHAFT && phase !== QUEUED && phase !== RIDING;
}

function stepPerson(context: StepContext, slot: number, pass: TrekPass): void {
  const pool = context.state.people;
  const phase = pool.trek[slot] as number;
  if (phase === IDLE || phase === QUEUED || phase === RIDING) return;
  if (phase <= WALKING_TO_SHAFT) {
    if (walk(pool, slot)) reachLegStart(context, slot);
  } else if (pool.legStep[slot] === context.state.step) {
    if (phase === WAITING_BESIDE_QUEUE) recheckFullQueue(context, slot, pass);
    else if (phase === NO_ROUTE) replan(context, slot);
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
    const graph = graphOf(context);
    if (!sweptGraphs.has(graph)) {
      sweptGraphs.add(graph);
      replanBrokenLegs(context);
    }
    const pass: TrekPass = {
      planner: plannerFor(graph),
      lobbyHeights: new Map(),
      plans: new Map(),
    };
    trekPasses.set(context, pass);
    const checkpoints = checkpointsOf(pool);
    const now = context.state.step;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const phase = pool.trek[slot] as number;
      if (phase === IDLE) continue;
      const legStep = pool.legStep[slot] as number;
      if (legStep !== now && waitsForLegStep(phase)) continue;
      const sum = pool.tripSum[slot] as number;
      stepPerson(context, slot, pass);
      if (isOnTrek(pool, slot) && stressMayHaveMoved(pool, slot, phase, sum, legStep)) {
        refreshTravellerStress(context, slot, checkpoints);
      }
    }
    trekPasses.delete(context);
  };
}
