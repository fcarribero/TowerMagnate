import {
  MAX_ESCALATOR_FLOORS_PER_TRIP,
  MAX_RIDES_PER_TRIP,
  MAX_STAIR_FLOORS_PER_TRIP,
  ROUTE_ESCALATOR_LEG_COST,
  ROUTE_EXPRESS_FLOOR_COST,
  ROUTE_FLOOR_COST,
  ROUTE_RETRY_STEPS,
  ROUTE_RIDE_COST,
  ROUTE_STAIR_LEG_COST,
  ROUTE_TRANSFER_COST,
  type EntityId,
  type HallDirection,
  type Level,
  type TowerState,
} from '@tower-magnate/shared';
import { fullQueueSurcharge } from '../elevator-queues';
import {
  floorIndex,
  type GraphNode,
  type Link,
  type LinkKind,
  type NodeId,
  type TransportGraph,
  type UserClass,
} from './transport-graph';

export interface RoutePoint {
  level: Level;
  x: number;
}

/** What a trip has already used; the counters live until the trip ends (routing 5.2, R-14). */
export interface TripBudget {
  stairFloors: number;
  escalatorFloors: number;
  rides: number;
}

export interface RouteRequest {
  from: RoutePoint;
  to: RoutePoint;
  userClass: UserClass;
  budget?: TripBudget;
}

export interface RouteStep {
  kind: LinkKind;
  via: EntityId;
  from: NodeId;
  to: NodeId;
  floors: number;
}

export interface FirstLeg {
  kind: 'stairs' | 'escalator' | 'ride';
  /** Columns walked on the current run to reach the first flight or shaft. */
  walkColumns: number;
  /** One step per flight of a stair or escalator leg, a single step for a ride. */
  steps: RouteStep[];
}

export interface RoutePlan {
  cost: number;
  transportLegs: number;
  columnsWalked: number;
  /** Null when the person is already on the destination's run. */
  firstLeg: FirstLeg | null;
}

export type TripKind = 'required' | 'optional';

export interface TripRequest extends RouteRequest {
  tripKind: TripKind;
  /** Where a subway trip goes instead when the subway has no route (routing section 9). */
  streetEntrance?: RoutePoint;
}

export type NoRouteOutcome = { action: 'retry'; afterSteps: number } | { action: 'cancel' };

export type TripPlan =
  | { kind: 'route'; plan: RoutePlan; switchedToStreet: boolean }
  | { kind: 'no-route'; outcome: NoRouteOutcome };

export const NO_BUDGET_USED: TripBudget = { stairFloors: 0, escalatorFloors: 0, rides: 0 };

/** What happens to a trip that has no route at the planning step (routing section 9). */
export function noRouteOutcome(tripKind: TripKind): NoRouteOutcome {
  return tripKind === 'required'
    ? { action: 'retry', afterSteps: ROUTE_RETRY_STEPS }
    : { action: 'cancel' };
}

/** The budget after a finished flight or ride (routing R-14). */
export function spendBudget(budget: TripBudget, step: RouteStep): TripBudget {
  if (step.kind === 'stairs') return { ...budget, stairFloors: budget.stairFloors + step.floors };
  if (step.kind === 'escalator') {
    return { ...budget, escalatorFloors: budget.escalatorFloors + step.floors };
  }
  return { ...budget, rides: budget.rides + 1 };
}

/*
 * A route value is one number so that comparing values is comparing cost, then transport legs,
 * then columns walked, then the level where the leg in progress ends (routing 7.2, rules 1, 2, 5).
 * Values add up along a route as long as each field stays inside its width.
 */
const END_RANGE = 128;
const COLUMN_RANGE = 8192;
const LEG_RANGE = 16;
const END_OFFSET = 10;

function pack(cost: number, legs: number, columns: number, end: number): number {
  return ((cost * LEG_RANGE + legs) * COLUMN_RANGE + columns) * END_RANGE + end;
}

function withoutEnd(value: number): number {
  return Math.floor(value / END_RANGE) * END_RANGE;
}

/** The cost, legs and columns part of a value. */
function prefixOf(value: number): number {
  return Math.floor(value / END_RANGE);
}

function costOf(value: number): number {
  return Math.floor(value / (END_RANGE * COLUMN_RANGE * LEG_RANGE));
}

function legsOf(value: number): number {
  return Math.floor(value / (END_RANGE * COLUMN_RANGE)) % LEG_RANGE;
}

function columnsOf(value: number): number {
  return Math.floor(value / END_RANGE) % COLUMN_RANGE;
}

const COST_UNIT_IN_PREFIX = LEG_RANGE * COLUMN_RANGE;

type PreviousLeg = 0 | 1 | 2 | 3;
const AFTER_STAIRS: PreviousLeg = 1;
const AFTER_ESCALATOR: PreviousLeg = 2;
const AFTER_RIDE: PreviousLeg = 3;

function previousLegOf(kind: LinkKind): PreviousLeg {
  if (kind === 'stairs') return AFTER_STAIRS;
  if (kind === 'escalator') return AFTER_ESCALATOR;
  return AFTER_RIDE;
}

function isWalkedLeg(previous: PreviousLeg): boolean {
  return previous === AFTER_STAIRS || previous === AFTER_ESCALATOR;
}

/** Tie break 3 (routing 7.2): escalator, then ride, then stairs. */
function firstLegRank(kind: LinkKind): number {
  if (kind === 'escalator') return 0;
  return kind === 'stairs' ? 2 : 1;
}

function idNumber(id: EntityId): number {
  return Number(id.slice(1));
}

interface Counters {
  stairs: number;
  escalator: number;
  rides: number;
}

/*
 * Counters packed in one integer: stair floors in bits 5-6, escalator floors in bits 2-4 and rides
 * in bits 0-1. The trip limits (3, 7, 3) keep each field inside its bits.
 */
type CounterCode = number;
const STAIR_FLOOR_UNIT = 32;
const ESCALATOR_FLOOR_UNIT = 4;

function counterCode(counters: Counters): CounterCode {
  return (
    counters.stairs * STAIR_FLOOR_UNIT + counters.escalator * ESCALATOR_FLOOR_UNIT + counters.rides
  );
}

function ridesIn(code: CounterCode): number {
  return code & 3;
}

function withinCodeBudget(link: Link, code: CounterCode): boolean {
  if (link.kind === 'stairs') {
    return (code >> 5) + link.floors <= MAX_STAIR_FLOORS_PER_TRIP;
  }
  if (link.kind === 'escalator') {
    return ((code >> 2) & 7) + link.floors <= MAX_ESCALATOR_FLOORS_PER_TRIP;
  }
  return (code & 3) + 1 <= MAX_RIDES_PER_TRIP;
}

function codeAfter(link: Link, code: CounterCode): CounterCode {
  if (link.kind === 'stairs') return code + link.floors * STAIR_FLOOR_UNIT;
  if (link.kind === 'escalator') return code + link.floors * ESCALATOR_FLOOR_UNIT;
  return code + 1;
}

function counterKey(code: CounterCode, previous: PreviousLeg): number {
  return code * 4 + previous;
}

const STATES_PER_NODE = 4 * 8 * 4 * 4;

function legCost(link: Link, rides: number, merges: boolean): number {
  const floorCost = link.kind === 'express' ? ROUTE_EXPRESS_FLOOR_COST : ROUTE_FLOOR_COST;
  const base = floorCost * link.floors;
  if (link.kind === 'escalator') return base + ROUTE_ESCALATOR_LEG_COST;
  if (link.kind === 'stairs') return base + (merges ? 0 : ROUTE_STAIR_LEG_COST);
  return base + ROUTE_RIDE_COST + (rides >= 1 ? ROUTE_TRANSFER_COST : 0);
}

function withinBudget(link: Link, counters: Counters): boolean {
  if (link.kind === 'stairs') {
    return counters.stairs + link.floors <= MAX_STAIR_FLOORS_PER_TRIP;
  }
  if (link.kind === 'escalator') {
    return counters.escalator + link.floors <= MAX_ESCALATOR_FLOORS_PER_TRIP;
  }
  return counters.rides + 1 <= MAX_RIDES_PER_TRIP;
}

/** Best remaining value from every state, for one destination point and user class. */
interface DestinationTable {
  point: RoutePoint;
  run: number;
  userClass: UserClass;
  values: Map<number, number>;
}

interface FirstOption {
  value: number;
  entry: GraphNode;
  link: Link | null;
}

/** A link reachable by walking to `entry` on its run; the same for every state, so built once. */
interface RunOption {
  entry: NodeId;
  x: number;
  link: Link;
  kindAfter: PreviousLeg;
}

const MAX_CACHED_DESTINATIONS = 256;
const MAX_CACHED_FIRST_OPTIONS = 4096;

/**
 * Route choice of routing sections 5 to 9. The best route from every state to a destination is
 * computed once and kept until the graph is rebuilt. A plan then only ranks the links of the
 * start run, so planning at trip start or re-plan stays cheap.
 */
export class TripPlanner {
  private revision = -1;
  private tables = new Map<string, DestinationTable>();
  private firstOptions = new Map<string, FirstOption[]>();
  private runOptions = new Map<number, RunOption[]>();

  constructor(private readonly graph: TransportGraph) {}

  /** The cheapest valid route, or null when there is none (routing 7.1, 7.2). */
  plan(state: TowerState, request: RouteRequest): RoutePlan | null {
    this.dropStaleCaches();
    const startRun = this.graph.runAtCell(request.from.level, request.from.x);
    const goalRun = this.graph.runAtCell(request.to.level, request.to.x);
    if (!startRun || !goalRun) return null;

    if (startRun.id === goalRun.id) {
      const walk = Math.abs(request.from.x - request.to.x);
      return { cost: 0, transportLegs: 0, columnsWalked: walk, firstLeg: null };
    }

    const budget = request.budget ?? NO_BUDGET_USED;
    const counters = {
      stairs: budget.stairFloors,
      escalator: budget.escalatorFloors,
      rides: budget.rides,
    };
    const table = this.tableFor(request.to, goalRun.id, request.userClass);
    const options = this.optionsFor(table, request, startRun.id, counters);
    const chosen = this.pickWithQueues(state, options);
    if (!chosen) return null;
    return this.describe(table, request, chosen, counters, state);
  }

  /** Route cost for choosing a venue: a new trip, so every counter is zero (routing 7.3). */
  routeCost(
    state: TowerState,
    from: RoutePoint,
    to: RoutePoint,
    userClass: UserClass,
  ): number | null {
    return this.plan(state, { from, to, userClass })?.cost ?? null;
  }

  /** Plans a trip, switching a subway trip to the street when the subway has no route. */
  planTrip(state: TowerState, trip: TripRequest): TripPlan {
    const plan = this.plan(state, trip);
    if (plan) return { kind: 'route', plan, switchedToStreet: false };

    const street = trip.streetEntrance;
    if (street) {
      const switched = this.replaceSubwayEnd(trip, street);
      if (switched) {
        const streetPlan = this.plan(state, switched);
        if (streetPlan) return { kind: 'route', plan: streetPlan, switchedToStreet: true };
        return { kind: 'no-route', outcome: noRouteOutcome(trip.tripKind) };
      }
    }
    return { kind: 'no-route', outcome: noRouteOutcome(trip.tripKind) };
  }

  private replaceSubwayEnd(trip: TripRequest, street: RoutePoint): RouteRequest | null {
    if (this.isSubwayEntrance(trip.from)) return { ...trip, from: street };
    if (this.isSubwayEntrance(trip.to)) return { ...trip, to: street };
    return null;
  }

  private isSubwayEntrance(point: RoutePoint): boolean {
    const node = this.graph.nodeAtCell(point.level, point.x);
    return node?.roles.includes('subway-entrance') ?? false;
  }

  private dropStaleCaches(): void {
    if (this.revision === this.graph.revision) return;
    this.revision = this.graph.revision;
    this.tables.clear();
    this.firstOptions.clear();
    this.runOptions.clear();
  }

  private runOptionsOf(run: number, userClass: UserClass): RunOption[] {
    const key = run * 2 + (userClass === 'maid' ? 1 : 0);
    let options = this.runOptions.get(key);
    if (!options) {
      options = [];
      for (const entryId of this.graph.run(run).nodes) {
        const x = this.graph.node(entryId).x;
        for (const link of this.graph.neighbours(entryId, userClass)) {
          options.push({ entry: entryId, x, link, kindAfter: previousLegOf(link.kind) });
        }
      }
      this.runOptions.set(key, options);
    }
    return options;
  }

  private tableFor(point: RoutePoint, run: number, userClass: UserClass): DestinationTable {
    const key = `${userClass}:${point.level}:${point.x}`;
    let table = this.tables.get(key);
    if (!table) {
      if (this.tables.size >= MAX_CACHED_DESTINATIONS) this.tables.clear();
      table = { point, run, userClass, values: new Map() };
      this.tables.set(key, table);
    }
    return table;
  }

  /** Every way to start the trip from the start run, best first by base value and tie breaks. */
  private optionsFor(
    table: DestinationTable,
    request: RouteRequest,
    startRun: number,
    counters: Counters,
  ): FirstOption[] {
    const { from } = request;
    const key = `${request.userClass}:${table.point.level}:${table.point.x}|${from.level}:${from.x}|${counters.stairs},${counters.escalator},${counters.rides}`;
    const cached = this.firstOptions.get(key);
    if (cached) return cached;

    const startCode = counterCode(counters);
    const options: FirstOption[] = [];
    for (const nodeId of this.graph.run(startRun).nodes) {
      const entry = this.graph.node(nodeId);
      const walk = Math.abs(entry.x - from.x);
      for (const link of this.graph.neighbours(nodeId, request.userClass)) {
        if (!withinBudget(link, counters)) continue;
        const previous = previousLegOf(link.kind);
        const rest = this.valueAt(table, link.to, codeAfter(link, startCode), previous);
        if (rest === Infinity) continue;
        const own = pack(legCost(link, counters.rides, false), 1, walk, 0);
        const value = isWalkedLeg(previous)
          ? own + rest
          : own + withoutEnd(rest) + this.endOf(link.to);
        options.push({ value, entry, link });
      }
    }
    options.sort((a, b) => this.compareOptions(a, b));
    if (this.firstOptions.size >= MAX_CACHED_FIRST_OPTIONS) this.firstOptions.clear();
    this.firstOptions.set(key, options);
    return options;
  }

  private endOf(node: NodeId): number {
    return floorIndex(this.graph.node(node).level) + END_OFFSET;
  }

  /** Routing 7.2 rules 1 to 5 on first legs: value, then kind, then transport id, then end level. */
  private compareOptions(a: FirstOption, b: FirstOption): number {
    return this.compareAdjusted(a, prefixOf(a.value), b, prefixOf(b.value));
  }

  private compareAdjusted(
    a: FirstOption,
    aPrefix: number,
    b: FirstOption,
    bPrefix: number,
  ): number {
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    const aLink = a.link as Link;
    const bLink = b.link as Link;
    const rank = firstLegRank(aLink.kind) - firstLegRank(bLink.kind);
    if (rank !== 0) return rank;
    const id = idNumber(aLink.via) - idNumber(bLink.via);
    if (id !== 0) return id;
    return (a.value % END_RANGE) - (b.value % END_RANGE);
  }

  /** The best option once full queues on the start run add their surcharge (routing R-12). */
  private pickWithQueues(state: TowerState, options: FirstOption[]): FirstOption | null {
    let best: FirstOption | null = null;
    let bestPrefix = Infinity;
    for (const option of options) {
      const base = prefixOf(option.value);
      if (best && base > bestPrefix) break;
      const adjusted = base + this.queueSurcharge(state, option) * COST_UNIT_IN_PREFIX;
      if (!best || this.compareAdjusted(option, adjusted, best, bestPrefix) < 0) {
        best = option;
        bestPrefix = adjusted;
      }
    }
    return best;
  }

  private queueSurcharge(state: TowerState, option: FirstOption): number {
    const link = option.link as Link;
    if (link.kind === 'stairs' || link.kind === 'escalator') return 0;
    const shaft = state.shafts[link.via];
    if (!shaft) return 0;
    const target = this.graph.node(link.to);
    const direction: HallDirection =
      floorIndex(target.level) > floorIndex(option.entry.level) ? 'up' : 'down';
    return fullQueueSurcharge(shaft, option.entry.level, direction);
  }

  private describe(
    table: DestinationTable,
    request: RouteRequest,
    chosen: FirstOption,
    counters: Counters,
    state: TowerState,
  ): RoutePlan {
    const link = chosen.link as Link;
    const surcharge = this.queueSurcharge(state, chosen);
    const walk = Math.abs(chosen.entry.x - request.from.x);
    const steps: RouteStep[] = [this.stepOf(chosen.entry.id, link)];
    if (link.kind !== 'escalator' && link.kind !== 'stairs') {
      return this.planOf(chosen, surcharge, walk, steps, 'ride');
    }
    this.extendChain(table, steps, codeAfter(link, counterCode(counters)), link.kind, link.to);
    return this.planOf(chosen, surcharge, walk, steps, link.kind);
  }

  private planOf(
    chosen: FirstOption,
    surcharge: number,
    walk: number,
    steps: RouteStep[],
    kind: FirstLeg['kind'],
  ): RoutePlan {
    return {
      cost: costOf(chosen.value) + surcharge,
      transportLegs: legsOf(chosen.value),
      columnsWalked: columnsOf(chosen.value),
      firstLeg: { kind, walkColumns: walk, steps },
    };
  }

  private stepOf(from: NodeId, link: Link): RouteStep {
    return { kind: link.kind, via: link.via, from, to: link.to, floors: link.floors };
  }

  /** Follows the best continuation while it is another flight of the same kind. */
  private extendChain(
    table: DestinationTable,
    steps: RouteStep[],
    code: CounterCode,
    kind: 'stairs' | 'escalator',
    at: NodeId,
  ): void {
    const previous = previousLegOf(kind);
    let current = at;
    let used = code;
    for (;;) {
      const next = this.bestContinuation(table, current, used, previous);
      if (!next || next.link.kind !== kind) return;
      steps.push(this.stepOf(next.entry, next.link));
      used = codeAfter(next.link, used);
      current = next.link.to;
    }
  }

  private bestContinuation(
    table: DestinationTable,
    at: NodeId,
    code: CounterCode,
    previous: PreviousLeg,
  ): { entry: NodeId; link: Link } | null {
    const target = this.valueAt(table, at, code, previous);
    if (target === Infinity) return null;
    let found: { entry: NodeId; link: Link } | null = null;
    this.eachOption(table, at, code, previous, (value, entry, link) => {
      if (!found && link && value === target) found = { entry, link };
    });
    return found;
  }

  private valueAt(
    table: DestinationTable,
    at: NodeId,
    code: CounterCode,
    previous: PreviousLeg,
  ): number {
    const key = at * STATES_PER_NODE + counterKey(code, previous);
    const known = table.values.get(key);
    if (known !== undefined) return known;
    let best = Infinity;
    this.eachOption(table, at, code, previous, (value) => {
      if (value < best) best = value;
    });
    table.values.set(key, best);
    return best;
  }

  /**
   * Every move from a person standing at a node after a leg of kind `previous`: finish on the
   * destination run, or walk along the run to any link. Flights of the previous kind join the leg
   * in progress, so a stair leg pays its constant once (routing R-10).
   */
  private eachOption(
    table: DestinationTable,
    at: NodeId,
    code: CounterCode,
    previous: PreviousLeg,
    visit: (value: number, entry: NodeId, link: Link | null) => void,
  ): void {
    const here = this.graph.node(at);
    const walked = isWalkedLeg(previous);
    const chainEnd = walked ? this.endOf(at) : 0;
    if (here.run === table.run) {
      visit(pack(0, 0, Math.abs(here.x - table.point.x), chainEnd), at, null);
    }
    const rides = ridesIn(code);
    for (const option of this.runOptionsOf(here.run, table.userClass)) {
      const { link } = option;
      if (!withinCodeBudget(link, code)) continue;
      const merges = option.kindAfter === previous && walked;
      const rest = this.valueAt(table, link.to, codeAfter(link, code), option.kindAfter);
      if (rest === Infinity) continue;
      const own = pack(
        legCost(link, rides, merges),
        merges ? 0 : 1,
        Math.abs(option.x - here.x),
        0,
      );
      visit(merges ? own + rest : own + withoutEnd(rest) + chainEnd, option.entry, link);
    }
  }
}
