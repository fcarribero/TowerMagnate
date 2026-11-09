import {
  PERSON_KINDS,
  type BombThreat,
  type EngineEvent,
  type Level,
  type StarRating,
  type TowerState,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { towerCommandHandlers } from '../commands';
import {
  canOpenBombThreat,
  createEventsPhase,
  eventsPhase,
  openRandomBombThreat,
  type BombRoll,
} from '../events';
import { hashState } from '../hash';
import { peopleCount } from '../people';
import { populationOf } from '../population';
import { createEngine, towerSystems, type Engine, type SimulationSystem } from '../step';
import { TREK_PHASES } from '../trek';
import { tenFloorOfficeTowerPlan } from './ten-floor-office-tower';
import { buildTower, type PlannedFlight, type TowerPlan } from './tower-builder';

export const VERTICAL_SLICE_SEED = 7;
export const VERTICAL_SLICE_DAYS = 14;
/** The day of the forced bomb threat (events 13.7): the last Sunday of the run. */
export const FORCED_BOMB_DAY = 13;
/** Step budgets of the 14 days, checked by `pnpm bench:vertical-slice`, not by tests. */
export const VERTICAL_SLICE_STEP_BUDGET_MS = 1.0;
export const VERTICAL_SLICE_P99_BUDGET_MS = 5.0;

const SHAFT_CARS = 2;
const STAIR_COLUMNS = [194, 202] as const;
const TOWER_X1 = 209;
const TOP_LEVEL = 10;
const LOBBY_LEVEL: Level = 1;
const THREE_AM = 3 * STEPS_PER_HOUR;
const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;

const IDLE = TREK_PHASES.indexOf('idle');
const ON_STAIRS = TREK_PHASES.indexOf('onStairs');
const RIDING = TREK_PHASES.indexOf('riding');
const OFFICE_WORKER = PERSON_KINDS.indexOf('officeWorker');

/**
 * The 10-floor office tower of stars 8.6 with a stair flight between every pair of levels.
 * Flights alternate between two columns so each landing sits on free floor. Stairs cost more than
 * a ride (routing 6), so people take them only when the lobby queue is full. The shaft has 2 cars:
 * with one, workers stand still in the morning queue for over an hour; with more, the queue rarely
 * fills and nobody takes the stairs.
 */
export function verticalSliceTowerPlan(): TowerPlan {
  const plan = tenFloorOfficeTowerPlan();
  const flights: PlannedFlight[] = [];
  for (let level = LOBBY_LEVEL; level < TOP_LEVEL; level++) {
    flights.push({ type: 'stairs', x: STAIR_COLUMNS[level % 2] as number, level });
  }
  return {
    ...plan,
    seed: VERTICAL_SLICE_SEED,
    lobby: { x0: 100, x1: TOWER_X1 },
    floors: [{ from: 2, to: TOP_LEVEL, x0: 100, x1: TOWER_X1 }],
    shafts: (plan.shafts ?? []).map((shaft) => ({ ...shaft, cars: SHAFT_CARS })),
    flights,
  };
}

export function verticalSliceTower(): TowerState {
  return buildTower(verticalSliceTowerPlan()).state;
}

/**
 * The scenario's 09:00 bomb roll (EV-38, EV-39): off before the forced day, then a threat that
 * skips the 1 in 60 draw but keeps every other condition of events 4.1.
 */
const forcedBombRoll: BombRoll = (context) => {
  const day = Math.floor(context.state.step / STEPS_PER_DAY);
  if (day !== FORCED_BOMB_DAY || !canOpenBombThreat(context.state)) return;
  openRandomBombThreat(context);
};

const sliceEventsPhase = createEventsPhase(forcedBombRoll);

/** The tower systems with the scenario's bomb roll in place of the daily one. */
function verticalSliceSystems(): SimulationSystem[] {
  return towerSystems.map((system) => (system === eventsPhase ? sliceEventsPhase : system));
}

export function createVerticalSliceEngine(extraSystems: readonly SimulationSystem[] = []): Engine {
  return createEngine({
    commandHandlers: towerCommandHandlers,
    systems: [...verticalSliceSystems(), ...extraSystems],
  });
}

export interface SliceDay {
  day: number;
  leasedOffices: number;
  population: number;
  stairTrips: number;
  elevatorTrips: number;
  /** Rent credited during the day. */
  rentIncome: number;
  /** The rating at the end of the day. */
  stars: StarRating;
}

/** A worker setting off: where from and when. */
export interface WorkerDeparture {
  step: number;
  homeUnit: number;
  fromLobby: boolean;
}

export interface SliceRun {
  state: TowerState;
  days: SliceDay[];
  workerDepartures: WorkerDeparture[];
  /** People on a trip at 03:00 of each day. */
  movingAtThreeAm: number[];
  /** The longest single trip, from setting off to arriving or leaving the tower. */
  longestTripSteps: number;
  /** The longest time a person on a trip kept the same level, column and phase. */
  longestStuckSteps: number;
  /** Rating changes, decisions, disasters and their notices, in the order they happened. */
  events: EngineEvent[];
  /** Each bomb threat as it stood on the step it opened. */
  bombThreats: BombThreat[];
  hash: string;
}

interface OpenTrip {
  startStep: number;
  usedStairs: boolean;
  rode: boolean;
  seenAt: number;
  place: string;
  placeSince: number;
}

interface TripTally {
  stairTrips: number;
  elevatorTrips: number;
  longestTripSteps: number;
  longestStuckSteps: number;
}

function placeOf(pool: TowerState['people'], slot: number): string {
  return `${pool.level[slot]}:${pool.column[slot]}:${pool.trek[slot]}`;
}

/** Watches every person's trip phase after each step and counts the trips that end. */
function tripWatcher(
  tally: TripTally,
  departures: WorkerDeparture[],
  movingAtThreeAm: number[],
): SimulationSystem {
  const open = new Map<number, OpenTrip>();
  const close = (trip: OpenTrip, now: number) => {
    if (trip.usedStairs) tally.stairTrips += 1;
    if (trip.rode) tally.elevatorTrips += 1;
    tally.longestTripSteps = Math.max(tally.longestTripSteps, now - trip.startStep);
  };
  const follow = (trip: OpenTrip, phase: number, place: string, now: number) => {
    trip.usedStairs ||= phase === ON_STAIRS;
    trip.rode ||= phase === RIDING;
    trip.seenAt = now;
    if (place === trip.place) {
      tally.longestStuckSteps = Math.max(tally.longestStuckSteps, now - trip.placeSince);
    } else {
      trip.place = place;
      trip.placeSince = now;
    }
  };
  return ({ state }) => {
    const pool = state.people;
    const now = state.step;
    let moving = 0;
    for (let slot = 0; slot < peopleCount(pool); slot++) {
      const personId = pool.id[slot] as number;
      const phase = pool.trek[slot] ?? IDLE;
      const trip = open.get(personId);
      if (phase === IDLE) {
        if (trip) {
          close(trip, now);
          open.delete(personId);
        }
        continue;
      }
      moving += 1;
      const place = placeOf(pool, slot);
      if (trip) {
        follow(trip, phase, place, now);
        continue;
      }
      open.set(personId, {
        startStep: now,
        usedStairs: phase === ON_STAIRS,
        rode: phase === RIDING,
        seenAt: now,
        place,
        placeSince: now,
      });
      if (pool.kind[slot] === OFFICE_WORKER) {
        departures.push({
          step: now,
          homeUnit: pool.homeUnit[slot] as number,
          fromLobby: pool.level[slot] === LOBBY_LEVEL,
        });
      }
    }
    for (const [personId, trip] of open) {
      if (trip.seenAt === now) continue;
      close(trip, now);
      open.delete(personId);
    }
    if (now % STEPS_PER_DAY === THREE_AM) movingAtThreeAm.push(moving);
  };
}

/** Keeps a copy of each bomb threat on the step it opens. */
function bombThreatWatcher(threats: BombThreat[]): SimulationSystem {
  return ({ state }) => {
    for (const event of state.activeEvents) {
      if (event.kind !== 'bomb' || event.decision.openStep !== state.step) continue;
      threats.push(structuredClone(event));
    }
  };
}

function leasedOffices(state: TowerState): number {
  return Object.values(state.units).filter((unit) => unit.type === 'office' && unit.lease !== null)
    .length;
}

const STORY_EVENT_TYPES: ReadonlySet<EngineEvent['type']> = new Set([
  'starsChanged',
  'decisionOpened',
  'decisionClosed',
  'disaster',
]);
const STORY_NEWS_KEYS: ReadonlySet<string> = new Set([
  'news.starsUp',
  'news.bombThreat',
  'news.decisionDefault',
  'news.bombSearch',
  'news.bombFound',
  'news.bombExploded',
]);

function isStoryEvent(event: EngineEvent): boolean {
  if (event.type === 'news') return STORY_NEWS_KEYS.has(event.key);
  return STORY_EVENT_TYPES.has(event.type);
}

/** Plays the vertical slice day by day and reads the summary at the end of each day. */
export function runVerticalSlice(
  days: number = VERTICAL_SLICE_DAYS,
  tower: TowerState = verticalSliceTower(),
): SliceRun {
  const tally: TripTally = {
    stairTrips: 0,
    elevatorTrips: 0,
    longestTripSteps: 0,
    longestStuckSteps: 0,
  };
  const workerDepartures: WorkerDeparture[] = [];
  const movingAtThreeAm: number[] = [];
  const bombThreats: BombThreat[] = [];
  const engine = createVerticalSliceEngine([
    tripWatcher(tally, workerDepartures, movingAtThreeAm),
    bombThreatWatcher(bombThreats),
  ]);
  const summaries: SliceDay[] = [];
  const events: EngineEvent[] = [];
  let state = tower;
  let rentCredited = 0;
  for (let day = 0; day < days; day++) {
    const before = { ...tally };
    const result = engine.step(state, [], STEPS_PER_DAY);
    state = result.state;
    events.push(...result.events.filter(isStoryEvent));
    const rentSoFar = rentIncomeOfWeek(state);
    summaries.push({
      day,
      leasedOffices: leasedOffices(state),
      population: populationOf(state).total,
      stairTrips: tally.stairTrips - before.stairTrips,
      elevatorTrips: tally.elevatorTrips - before.elevatorTrips,
      rentIncome: rentSoFar - rentCredited,
      stars: state.stars,
    });
    rentCredited = state.step % STEPS_PER_WEEK === 0 ? 0 : rentSoFar;
  }
  return {
    state,
    days: summaries,
    workerDepartures,
    movingAtThreeAm,
    longestTripSteps: tally.longestTripSteps,
    longestStuckSteps: tally.longestStuckSteps,
    events,
    bombThreats,
    hash: hashState(state),
  };
}

/** Rent credited this week; on the step that starts a week the totals have just rolled over. */
function rentIncomeOfWeek(state: TowerState): number {
  const weekJustRolled = state.step % STEPS_PER_WEEK === 0;
  const week = weekJustRolled ? state.ledger.previousWeek : state.ledger.currentWeek;
  return week.rent.income;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** One line per day: leased offices, population, stair trips, elevator trips, rent income, stars. */
export function formatSliceDays(days: readonly SliceDay[]): string {
  const header = 'Day  Leased  Population  Stair trips  Elevator trips  Rent income  Stars';
  const lines = days.map((day) =>
    [
      (WEEKDAY_NAMES[day.day % 7] as string).padEnd(3),
      String(day.leasedOffices).padStart(7),
      String(day.population).padStart(11),
      String(day.stairTrips).padStart(12),
      String(day.elevatorTrips).padStart(15),
      `$${day.rentIncome.toLocaleString('en-US')}`.padStart(12),
      String(day.stars).padStart(6),
    ].join(' '),
  );
  return [header, ...lines].join('\n');
}

function describeEvent(event: EngineEvent): string {
  switch (event.type) {
    case 'starsChanged':
      return `starsChanged to ${event.stars}`;
    case 'decisionOpened':
      return `decisionOpened ${event.kind}, deadline ${event.deadlineStep}`;
    case 'decisionClosed':
      return `decisionClosed ${event.choice}`;
    case 'disaster':
      return `disaster ${event.kind}, ${event.cells.length} ruined spans`;
    case 'news':
      return event.params.level === undefined
        ? event.key
        : `${event.key} on level ${event.params.level}`;
    default:
      return event.type;
  }
}

/** One line per rating change, decision, disaster and notice, with its step. */
export function formatSliceEvents(events: readonly EngineEvent[]): string {
  return events
    .map((event) => `${String(event.step).padStart(7)}  ${describeEvent(event)}`)
    .join('\n');
}

export interface SliceTiming {
  people: number;
  steps: number;
  averageMs: number;
  p99Ms: number;
}

/** Times every step of one full run of the slice. */
export function timeVerticalSlice(): SliceTiming {
  const times = new Float64Array(VERTICAL_SLICE_DAYS * STEPS_PER_DAY);
  let started = 0;
  const startClock: SimulationSystem = () => {
    started = performance.now();
  };
  const stopClock: SimulationSystem = ({ state }) => {
    times[state.step - 1] = performance.now() - started;
  };
  const engine = createEngine({
    commandHandlers: towerCommandHandlers,
    systems: [startClock, ...verticalSliceSystems(), stopClock],
  });
  const state = engine.runDays(verticalSliceTower(), VERTICAL_SLICE_DAYS).state;
  const sorted = Array.from(times).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    people: peopleCount(state.people),
    steps: times.length,
    averageMs: total / times.length,
    p99Ms: sorted[Math.floor(sorted.length * 0.99)] as number,
  };
}
