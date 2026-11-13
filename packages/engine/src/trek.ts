import {
  carCapacity,
  ELEVATOR_QUEUE_CAPACITY,
  ENERGY_STAIRS_DRAIN,
  ENERGY_WAIT_DRAIN,
  ENERGY_WALK_DRAIN,
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
  UNIT_CATALOG,
  type EntityId,
  type HallDirection,
  type Level,
  type PersonPool,
  type Shaft,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { SECONDS_PER_STEP, STEPS_PER_DAY } from './clock';
import { drainEnergy, energyLevelOf, leaveHome, resetEnergy, restEnergy } from './energy';
import { isQueueFull, joinQueue, nextQueueCheckStep, queueLength } from './elevator-queues';
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
import { CHILD_KIND, householdIndexOf, isChild } from './children';
import { NOTHING_DUE, parsePersonId, personEntityId, removePerson, slotOfPerson } from './people';
import { floorIndex } from './routing/transport-graph';
import { mainLobbyEnds, nearestStreetColumn, STREET_LEVEL } from './street';
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
  // A person who comes in from the street, or leaves to it, walks along the ground outside the
  // lobby. Appended last so saved phase numbers keep their meaning.
  'approaching',
  'departing',
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
const APPROACHING = TREK_PHASES.indexOf('approaching');
const DEPARTING = TREK_PHASES.indexOf('departing');

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

/**
 * The budget number also carries where the person walks to after the destination: 0 for nowhere,
 * 1 for the left edge of the map and 2 for the right edge, as multiples of BUDGET_RANGE.
 */
function streetFlagOf(stored: number): number {
  return Math.floor(stored / BUDGET_RANGE);
}

function streetFlagFor(column: number | undefined): number {
  if (column === undefined) return 0;
  return column === 0 ? 1 : 2;
}

function repackBudget(budget: TripBudget, previous: number): number {
  return packBudget(budget) + streetFlagOf(previous) * BUDGET_RANGE;
}

function unpackBudget(stored: number): TripBudget {
  const packed = stored % BUDGET_RANGE;
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
  return plannerFor(graphOf(context)).plan(
    context.state,
    {
      from: { level: pool.level[slot] as Level, x: pool.column[slot] as number },
      to: { level: pool.trekLevel[slot] as Level, x: pool.trekColumn[slot] as number },
      userClass,
      budget: unpackBudget(pool.trekBudget[slot] as number),
      energy: energyLevelOf(pool, slot),
    },
    leftShaftsOf(pool, slot),
  );
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
  context: StepContext;
  planner: TripPlanner;
  /** Lobby height by `placeKey`; the grid does not change during a trek pass. */
  lobbyHeights: Map<number, number | null>;
  plans: Map<number, Map<number, RecheckResult>>;
  /** The walker in each lane cell (see `laneKey`), and the cell each walker is registered in. */
  lane: Map<number, number>;
  laneOf: Map<number, number>;
  /** Slots already moved in this pass, so that a walker is never moved twice in one step. */
  done: Uint8Array;
  advance: (slot: number) => void;
}

const trekPasses = new WeakMap<StepContext, TrekPass>();

const COLUMN_SPAN = LAST_COLUMN + 1;

/** One small integer per cell of the site. */
function placeKey(level: number, column: number): number {
  return (level - LOWEST_LEVEL) * COLUMN_SPAN + column;
}

function recheckStart(pool: PersonPool, slot: number): number {
  const place = placeKey(pool.level[slot] as number, pool.column[slot] as number);
  return place * BUDGET_RANGE + ((pool.trekBudget[slot] as number) % BUDGET_RANGE);
}

function destinationGroupOf(pass: TrekPass, pool: PersonPool, slot: number): number | null {
  const to = { level: pool.trekLevel[slot] as Level, x: pool.trekColumn[slot] as number };
  return pass.planner.destinationGroup(
    to,
    pool.kind[slot] === MAID_KIND ? 'maid' : 'other',
    energyLevelOf(pool, slot),
  );
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
      energy: energyLevelOf(pool, slot),
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

function shaftStillRuns(state: TowerState, shaftNumber: number): boolean {
  const shaft = state.shafts[shaftKey(shaftNumber)];
  return shaft !== undefined && shaft.cars.length > 0;
}

/** Routing 8.4: a re-plan keeps the switch count and the left shafts that still run, and drops the rest. */
function dropGoneLeftShafts(state: TowerState, slot: number): void {
  const pool = state.people;
  const kept = leftShaftsOf(pool, slot).filter((via) => shaftStillRuns(state, via));
  pool.leftShafts[slot] = 0;
  for (const via of kept) addLeftShaft(pool, slot, via);
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

/**
 * A flight climbs from the left foot of the unit to the right end on the level above. People walk
 * to the foot before they climb and stand at the top when they get off; going down they walk to
 * the right end, where the flight starts, and get off at the foot. Routing still prices a flight
 * at its point at x + 4 (routing section 3).
 */
function flightFoot(
  context: StepContext,
  kind: string,
  via: string,
  descending = false,
): number | undefined {
  if (kind !== 'stairs' && kind !== 'escalator') return undefined;
  const transport = context.state.transports[via];
  if (transport === undefined) return undefined;
  return descending ? flightTop(transport) : transport.x;
}

function flightTop(transport: { type: UnitType; x: number }): number {
  return transport.x + UNIT_CATALOG[transport.type].width - 1;
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
    column:
      flightFoot(
        context,
        leg.kind,
        first.via,
        floorIndex(graph.node(first.to).level) < floorIndex(graph.node(first.from).level),
      ) ?? graph.node(first.from).x,
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
function planNextLeg(context: StepContext, slot: number, given?: RoutePlan | null): boolean {
  const pool = context.state.people;
  if (given === undefined && !isChild(pool, slot)) {
    const door = streetDoorOf(context.state, pool, slot);
    if (door !== null) return approach(context, slot, door);
  }
  const plan = given === undefined ? planFrom(context, slot) : given;
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
 * The lobby end a person on the ground level has to walk to first, when they stand outside the
 * lobby: just come in from the street, or left standing where the lobby was demolished. Null when
 * they are inside the lobby run or on another level; -1 when the tower has no lobby.
 */
function streetDoorOf(state: TowerState, pool: PersonPool, slot: number): number | null {
  if (pool.level[slot] !== STREET_LEVEL) return null;
  const column = pool.column[slot] as number;
  const ends = mainLobbyEnds(state);
  if (!ends) return -1;
  if (column < ends.left) return ends.left;
  if (column > ends.right) return ends.right;
  return null;
}

/**
 * Walks the person along the ground to the lobby end `door`, where the planned trip starts. With
 * no lobby, or no route from its door, nothing changes and false is returned.
 */
function approach(context: StepContext, slot: number, door: number): boolean {
  const pool = context.state.people;
  if (door < 0) {
    pool.trek[slot] = IDLE;
    return false;
  }
  const column = pool.column[slot] as number;
  pool.column[slot] = door;
  const plan = planFrom(context, slot);
  pool.column[slot] = column;
  if (!plan) {
    pool.trek[slot] = IDLE;
    return false;
  }
  setLeg(pool, slot, APPROACHING, { via: 0, level: STREET_LEVEL, column: door });
  return true;
}

/** The person stands at the destination and still has the street to walk out to. */
function startDeparture(context: StepContext, slot: number, flag: number): void {
  const pool = context.state.people;
  const edge = flag === 1 ? 0 : LAST_COLUMN;
  setLeg(pool, slot, DEPARTING, { via: 0, level: STREET_LEVEL, column: edge });
  if (pool.column[slot] === edge) arrive(context, slot);
}

/**
 * A person who stood in the lobby when it was demolished is outside from then on: they are put at
 * the nearest edge of the map and walk in again from there, to the same place as before. Someone
 * walking out just finishes their walk. Works on the state alone, for the demolish command.
 */
export function sendToStreet(state: TowerState, slot: number): void {
  const pool = state.people;
  const phase = pool.trek[slot] as number;
  if (phase === DEPARTING) {
    pool.column[slot] = pool.legColumn[slot] as number;
    return;
  }
  pool.column[slot] = nearestStreetColumn(pool.column[slot] as number);
  if (phase === IDLE || phase === QUEUED || phase === RIDING) return;
  pool.trek[slot] = NO_ROUTE;
  pool.legStep[slot] = state.step + 1;
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
  plan?: RoutePlan | null,
): void {
  if (isChild(context.state.people, slot)) {
    // A child never plans: it is let go here and the child system copies the guardian again.
    releaseChild(context, slot);
    return;
  }
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
export function startTrek(
  context: StepContext,
  slot: number,
  to: TrekPlace,
  streetColumn?: number,
): boolean {
  const pool = context.state.people;
  leaveHome(pool, slot);
  pool.trekLevel[slot] = to.level;
  pool.trekColumn[slot] = to.column;
  pool.trekBudget[slot] =
    packBudget({ stairFloors: 0, escalatorFloors: 0, rides: 0 }) +
    streetFlagFor(streetColumn) * BUDGET_RANGE;
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
  if (isChild(pool, slot)) {
    releaseChild(context, slot);
    return;
  }
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
  if (!isChild(pool, slot)) dropChildrenFromQueue(context, slot, queue);
  const wasFull = isQueueFull(shaft, pool.level[slot] as Level, direction);
  queue.splice(at, 1);
  if (wasFull) forgetRecheckPlans(context);
  realignQueue(context, shaft, pool.level[slot] as Level, direction);
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
  const place = queueLength(shaft, level, direction) - 1;
  pool.column[slot] = lineCell(context, level, pool.legColumn[slot] as number, direction, place);
  queueChildrenBehind(context, slot, shaft, level, direction);
  if (isQueueFull(shaft, level, direction)) forgetPlansRidingFrom(context, shaft, level, direction);
}

/**
 * The cell of the person at `place` in the line for a hall call. The line starts at the shaft
 * column and runs away from it along the floor: to the right for the up queue and to the left for
 * the down queue. It stops at the end of the walkable run, where people then share a cell.
 */
function lineCell(
  context: StepContext,
  level: Level,
  base: number,
  direction: HallDirection,
  place: number,
): number {
  const run = graphOf(context).runAtCell(level, base);
  const offset = Math.min(place, ELEVATOR_QUEUE_CAPACITY);
  if (direction === 'up') return Math.min(base + offset, run?.x1 ?? LAST_COLUMN);
  return Math.max(base - offset, run?.x0 ?? 0);
}

/** Moves everyone queued for a hall call to the cell their place in the line gives them. */
export function realignQueue(
  context: StepContext,
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
): void {
  const pool = context.state.people;
  const queue = shaft.queues[String(level)]?.[direction];
  if (!queue) return;
  queue.forEach((entry, place) => {
    const slot = slotOfEntity(context, entry.person);
    if (slot < 0 || pool.trek[slot] !== QUEUED) return;
    pool.column[slot] = lineCell(context, level, pool.legColumn[slot] as number, direction, place);
  });
}

function enterQueueOrWait(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  const shaft = state.shafts[shaftKey(pool.legVia[slot] as number)];
  if (!shaft) {
    dropGoneLeftShafts(state, slot);
    replan(context, slot);
    return;
  }
  const level = pool.level[slot] as Level;
  const destination = pool.legLevel[slot] as Level;
  const direction = directionBetween(level, destination);
  if (queueIsFullFor(context, slot, shaft, level, direction)) {
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
  if (!shaft || queueIsFullFor(context, slot, shaft, level, direction)) return false;
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
    dropGoneLeftShafts(state, slot);
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
    const flag = streetFlagOf(context.state.people.trekBudget[slot] as number);
    if (flag > 0) startDeparture(context, slot, flag);
    else arrive(context, slot);
  } else if (phase === DEPARTING) {
    arrive(context, slot);
  } else if (phase === APPROACHING) {
    replan(context, slot);
  } else if (phase === WALKING_TO_STAIRS || phase === WALKING_TO_ESCALATOR) {
    const onStairs = phase === WALKING_TO_STAIRS;
    if (!flightExists(context, slot)) {
      dropGoneLeftShafts(context.state, slot);
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
    context.state.people.column[slot] = context.state.people.legColumn[slot] as number;
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
  pool.trekBudget[slot] = repackBudget(
    spendBudget(budget, ride),
    pool.trekBudget[slot] as number,
  );
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
  pool.trekBudget[slot] = repackBudget(
    spendBudget(budget, flight),
    pool.trekBudget[slot] as number,
  );
  addFlight(pool, slot, kind);
  const transport = context.state.transports[transportKey(pool.legVia[slot] as number)];
  if (transport) {
    const climbing =
      floorIndex(pool.legLevel[slot] as Level) > floorIndex(pool.level[slot] as Level);
    pool.column[slot] = climbing ? flightTop(transport) : transport.x;
  }
  pool.level[slot] = pool.legLevel[slot] as number;
  replan(context, slot);
}

/**
 * The cell a walking person occupies: one lane per direction on each level, so two people walking
 * in opposite directions pass through each other and two walking the same way never share a cell.
 * Null for a person who is not walking.
 */
function laneKey(context: StepContext, slot: number): number | null {
  const pool = context.state.people;
  const phase = pool.trek[slot] as number;
  if (phase === IDLE || !isWalkingPhase(phase) || pool.kind[slot] === CHILD_KIND) return null;
  const column = pool.column[slot] as number;
  const target = targetColumn(context, slot);
  if (column === target) return null;
  return placeKey(pool.level[slot] as number, column) * 2 + (target < column ? 1 : 0);
}

/**
 * The column a walking person is heading for. Someone walking to a shaft stops at the end of the
 * line for it, so the target moves as the line grows and shrinks.
 */
function targetColumn(context: StepContext, slot: number): number {
  const pool = context.state.people;
  const base = pool.legColumn[slot] as number;
  if (pool.trek[slot] !== WALKING_TO_SHAFT) return base;
  const shaft = context.state.shafts[shaftKey(pool.legVia[slot] as number)];
  if (!shaft) return base;
  const level = pool.level[slot] as Level;
  const direction = directionBetween(level, pool.legLevel[slot] as Level);
  const length = queueLength(shaft, level, direction);
  // A full line takes nobody: people wait beside the shaft until it has room.
  if (length >= ELEVATOR_QUEUE_CAPACITY) return base;
  return lineCell(context, level, base, direction, length);
}

/** Keeps the lane registry in line with where the person now is and what they are doing. */
function syncLane(pass: TrekPass, slot: number): void {
  const next = laneKey(pass.context, slot);
  const old = pass.laneOf.get(slot) ?? null;
  if (next === old) return;
  if (old !== null) {
    if (pass.lane.get(old) === slot) pass.lane.delete(old);
    pass.laneOf.delete(slot);
  }
  if (next !== null) {
    if (!pass.lane.has(next)) pass.lane.set(next, slot);
    pass.laneOf.set(slot, next);
  }
}

/**
 * Moves one column toward the leg's column; true when the person is there. A person whose next
 * cell is held by someone walking the same way waits. A person right behind someone who has not
 * moved yet this step lets that person move first.
 */
function walk(context: StepContext, slot: number, pass: TrekPass): boolean {
  const pool = context.state.people;
  const column = pool.column[slot] as number;
  const target = targetColumn(context, slot);
  const direction = Math.sign(target - column);
  if (direction === 0) return true;
  const level = pool.level[slot] as number;
  const nextKey = placeKey(level, column + direction) * 2 + (direction < 0 ? 1 : 0);
  let ahead = pass.lane.get(nextKey);
  if (ahead !== undefined && ahead !== slot && ahead > slot && !pass.done[ahead]) {
    pass.advance(ahead);
    ahead = pass.lane.get(nextKey);
  }
  pool.facing[slot] = direction < 0 ? 1 : 0;
  if (ahead !== undefined && ahead !== slot) {
    drainEnergy(pool, slot, ENERGY_WAIT_DRAIN);
    return false;
  }
  drainEnergy(pool, slot, ENERGY_WALK_DRAIN);
  pool.column[slot] = column + direction;
  syncLane(pass, slot);
  return pool.column[slot] === target;
}

/** True while the person is walking along a level, whatever for. */
function isWalkingPhase(phase: number): boolean {
  return phase <= WALKING_TO_SHAFT || phase === APPROACHING || phase === DEPARTING;
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
    dropGoneLeftShafts(context.state, slot);
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

/** 03:00, when energy is reset for the new day. */
const NIGHT_RESET_STEP = (3 * 3600) / SECONDS_PER_STEP;

/** Energy lost in a step standing in a line or on a flight of stairs; walking is drained in `walk`. */
function drainWhileWaiting(pool: PersonPool, slot: number, phase: number): void {
  if (phase === QUEUED || phase === WAITING_BESIDE_QUEUE) {
    drainEnergy(pool, slot, ENERGY_WAIT_DRAIN);
  } else if (phase === ON_STAIRS) {
    drainEnergy(pool, slot, ENERGY_STAIRS_DRAIN);
  }
}

/** Phases in which nothing happens until the leg step: flights, a full queue, no route. */
function waitsForLegStep(phase: number): boolean {
  return !isWalkingPhase(phase) && phase !== QUEUED && phase !== RIDING;
}

function stepPerson(context: StepContext, slot: number, pass: TrekPass): void {
  const pool = context.state.people;
  const phase = pool.trek[slot] as number;
  if (phase === IDLE || phase === QUEUED || phase === RIDING) return;
  if (isWalkingPhase(phase)) {
    if (walk(context, slot, pass)) reachLegStart(context, slot);
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
    const checkpoints = checkpointsOf(pool);
    const now = context.state.step;
    if (now % STEPS_PER_DAY === NIGHT_RESET_STEP) resetEnergy(pool);
    const advance = (slot: number): void => {
      pass.done[slot] = 1;
      if (pool.kind[slot] === CHILD_KIND) return;
      const phase = pool.trek[slot] as number;
      if (phase === IDLE) {
        restEnergy(pool, slot);
        return;
      }
      drainWhileWaiting(pool, slot, phase);
      const legStep = pool.legStep[slot] as number;
      if (legStep !== now && waitsForLegStep(phase)) return;
      const sum = pool.tripSum[slot] as number;
      stepPerson(context, slot, pass);
      syncLane(pass, slot);
      if (isOnTrek(pool, slot) && stressMayHaveMoved(pool, slot, phase, sum, legStep)) {
        refreshTravellerStress(context, slot, checkpoints);
      }
    };
    const pass: TrekPass = {
      context,
      planner: plannerFor(graph),
      lobbyHeights: new Map(),
      plans: new Map(),
      lane: new Map(),
      laneOf: new Map(),
      done: new Uint8Array(pool.id.length),
      advance,
    };
    trekPasses.set(context, pass);
    for (let slot = 0; slot < pool.id.length; slot++) syncLane(pass, slot);
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (!pass.done[slot]) advance(slot);
    }
    trekPasses.delete(context);
  };
}

/** Slots of the children that follow this guardian, or an empty list. */
function childrenOf(context: StepContext, guardian: number): readonly number[] {
  const index = householdIndexOf(context.state.people, context.state.step);
  return index.childrenOfGuardian.get(guardian) ?? [];
}

/** A guardian with children needs a place in the line for each of them as well as for themselves. */
function queueIsFullFor(
  context: StepContext,
  slot: number,
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
): boolean {
  if (isChild(context.state.people, slot)) return isQueueFull(shaft, level, direction);
  const needed = 1 + childrenOf(context, slot).length;
  return queueLength(shaft, level, direction) + needed > ELEVATOR_QUEUE_CAPACITY;
}

/** Copies the guardian's leg onto the child, so the child is bound for the same shaft and floor. */
function copyLeg(pool: PersonPool, child: number, guardian: number, phase: number): void {
  pool.trek[child] = phase;
  pool.level[child] = pool.level[guardian] as number;
  pool.trekLevel[child] = pool.trekLevel[guardian] as number;
  pool.trekColumn[child] = pool.trekColumn[guardian] as number;
  pool.legVia[child] = pool.legVia[guardian] as number;
  pool.legLevel[child] = pool.legLevel[guardian] as number;
  pool.legColumn[child] = pool.legColumn[guardian] as number;
  pool.legStep[child] = pool.legStep[guardian] as number;
  pool.facing[child] = pool.facing[guardian] as number;
  pool.trip[child] = pool.trip[guardian] as number;
  pool.dueStep[child] = NOTHING_DUE;
}

/**
 * Puts each child of the guardian in the line right behind them, in the same hall call, bound for
 * the same floor. A child still riding out of an earlier car is added by the child system later.
 */
function queueChildrenBehind(
  context: StepContext,
  guardian: number,
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
): void {
  const pool = context.state.people;
  for (const child of childrenOf(context, guardian)) {
    if (pool.trek[child] === RIDING || pool.trek[child] === QUEUED) continue;
    const person = personEntityId(pool.id[child] as number);
    const destination = pool.legLevel[guardian] as Level;
    if (!joinQueue(shaft, level, direction, person, destination, context.state.step)) continue;
    copyLeg(pool, child, guardian, QUEUED);
    const place = queueLength(shaft, level, direction) - 1;
    pool.column[child] = lineCell(
      context,
      level,
      pool.legColumn[guardian] as number,
      direction,
      place,
    );
  }
}

/** The guardian leaves a line: the children behind them leave it too. */
function dropChildrenFromQueue(
  context: StepContext,
  guardian: number,
  queue: { person: EntityId }[],
): void {
  const pool = context.state.people;
  for (const child of childrenOf(context, guardian)) {
    if (pool.trek[child] !== QUEUED) continue;
    const person = personEntityId(pool.id[child] as number);
    const at = queue.findIndex((entry) => entry.person === person);
    if (at >= 0) queue.splice(at, 1);
    clearTrek(pool, child);
  }
}

/** A child leaves the line or the car it is in and goes back to following the guardian. */
function releaseChild(context: StepContext, slot: number): void {
  const pool = context.state.people;
  if (pool.trek[slot] === QUEUED) leaveQueueOf(context, slot);
  if (pool.trek[slot] === RIDING) leaveCarOf(context, slot);
  clearTrek(pool, slot);
}

/**
 * How many children a person at the front of a line would bring into the car with them. The car
 * lets the guardian in only when it has room for all of them, so the household rides together.
 */
export function ridersBroughtBy(context: StepContext, person: EntityId): number {
  const slot = slotOfEntity(context, person);
  const pool = context.state.people;
  if (slot < 0 || isChild(pool, slot)) return 0;
  let queued = 0;
  for (const child of childrenOf(context, slot)) if (pool.trek[child] === QUEUED) queued += 1;
  return queued;
}

function isInCar(context: StepContext, slot: number): boolean {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[slot] as number)];
  if (!shaft) return false;
  const person = personEntityId(pool.id[slot] as number);
  return shaft.cars.some((car) => car.riders.includes(person));
}

/** Puts a child who is not in the guardian's line right behind the guardian in it. */
function queueChildAfter(context: StepContext, guardian: number, child: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[guardian] as number)];
  if (!shaft) return;
  const level = pool.level[guardian] as Level;
  const direction = directionBetween(level, pool.legLevel[guardian] as Level);
  const queue = shaft.queues[String(level)]?.[direction];
  const self = personEntityId(pool.id[guardian] as number);
  const at = queue?.findIndex((entry) => entry.person === self) ?? -1;
  if (!queue || at < 0) return;
  const front = queue[at];
  queue.splice(at + 1, 0, {
    person: personEntityId(pool.id[child] as number),
    destination: pool.legLevel[guardian] as Level,
    joinedStep: front?.joinedStep ?? context.state.step,
  });
  copyLeg(pool, child, guardian, QUEUED);
  realignQueue(context, shaft, level, direction);
}

/** Puts a child into the car the guardian rides in, when there is room. */
function seatChildWithGuardian(context: StepContext, guardian: number, child: number): void {
  const pool = context.state.people;
  const shaft = context.state.shafts[shaftKey(pool.legVia[guardian] as number)];
  if (!shaft) return;
  const self = personEntityId(pool.id[guardian] as number);
  const car = shaft.cars.find((candidate) => candidate.riders.includes(self));
  if (!car || car.riders.length >= carCapacity(shaft.type)) return;
  const trip = car.trips[car.riders.indexOf(self)];
  if (!trip) return;
  car.riders.push(personEntityId(pool.id[child] as number));
  car.trips.push({ ...trip, boardedStep: context.state.step, waitSteps: 0 });
  copyLeg(pool, child, guardian, RIDING);
  pool.column[child] = pool.legColumn[guardian] as number;
}

function followGuardian(context: StepContext, guardian: number, child: number): void {
  const pool = context.state.people;
  const guardianPhase = pool.trek[guardian] as number;
  const childPhase = pool.trek[child] as number;
  pool.trip[child] = pool.trip[guardian] as number;
  const sameLeg =
    pool.legVia[child] === pool.legVia[guardian] && pool.level[child] === pool.level[guardian];
  if (childPhase === QUEUED) {
    if ((guardianPhase === QUEUED || guardianPhase === RIDING) && sameLeg) return;
    leaveQueueOf(context, child);
    clearTrek(pool, child);
  } else if (childPhase === RIDING) {
    if (isInCar(context, child)) return;
    clearTrek(pool, child);
  }
  if (guardianPhase === QUEUED) {
    queueChildAfter(context, guardian, child);
  } else if (guardianPhase === RIDING) {
    seatChildWithGuardian(context, guardian, child);
  } else {
    copyLeg(pool, child, guardian, guardianPhase);
    pool.column[child] = pool.column[guardian] as number;
  }
}

/**
 * Children have no will of their own. After the elevators move, each child copies the guardian
 * (the adult of the home with the lowest id): the same place, the same trip, the same sleep or
 * outing. In a hall line a child stands right behind the guardian and boards the same car on the
 * next step; a child whose home has no adult left leaves the tower with it.
 */
export function createChildSystem(): SimulationSystem {
  return (context) => {
    const pool = context.state.people;
    if (!pool.kind.includes(CHILD_KIND)) return;
    const index = householdIndexOf(pool, context.state.step);
    if (index.orphans.length > 0) {
      const gone = index.orphans.map((slot) => pool.id[slot] as number);
      for (const id of gone) removePerson(context.state, id);
      return;
    }
    for (const [guardian, children] of index.childrenOfGuardian) {
      for (const child of children) followGuardian(context, guardian, child);
    }
  };
}
