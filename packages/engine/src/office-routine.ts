import {
  FAST_FOOD_CAPACITY,
  FAST_FOOD_HOURS,
  FAST_FOOD_LUNCH_MINUTES,
  OFFICE_WORKER_ARRIVAL,
  OFFICE_WORKER_LEAVE,
  OFFICE_WORKER_LUNCH_CHANCE,
  OFFICE_WORKER_LUNCH_DEPARTURE,
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  UNIT_CATALOG,
  VENUE_CANDIDATES_DRAWN,
  type Level,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createPeopleSystem, NO_TRIP, NOTHING_DUE } from './people';
import { chance, nextInt } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { drawMinuteFromWindow } from './time-windows';
import { unitNumber } from './units';

export interface Place {
  level: Level;
  column: number;
}

/** Steps a trip takes between two places, or null when there is no route. */
export type RoutePlanner = (state: TowerState, from: Place, to: Place) => number | null;

/** Until the routing system exists: every place is reachable, one step per column and six per level. */
export const straightLineRoutes: RoutePlanner = (_state, from, to) =>
  Math.abs(from.column - to.column) + 6 * Math.abs(from.level - to.level);

export type RoutinePhase =
  | 'waitingToArrive'
  | 'walkingIn'
  | 'givingUpArrival'
  | 'atOffice'
  | 'toLunch'
  | 'atLunch'
  | 'backFromLunch'
  | 'leaving';

const PHASES: readonly RoutinePhase[] = [
  'waitingToArrive',
  'walkingIn',
  'givingUpArrival',
  'atOffice',
  'toLunch',
  'atLunch',
  'backFromLunch',
  'leaving',
];

/** What one office worker is doing today, kept in the person's `trip` number. */
export interface OfficeRoutine {
  phase: RoutinePhase;
  lunchHandled: boolean;
  /** The street entrance used to come in, so the worker leaves by the same one. */
  entranceOnRight: boolean;
  /** Unit number of the fast food being visited, or 0. */
  venue: number;
  lunchMinute: number;
  leaveMinute: number;
}

const MINUTES_PER_DAY = 24 * 60;
const VENUE_RANGE = 1_000_000;
const PHASE_RANGE = 16;

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodeRoutine(routine: OfficeRoutine): number {
  const phase = PHASES.indexOf(routine.phase) + 1;
  let packed = routine.lunchMinute * MINUTES_PER_DAY + routine.leaveMinute;
  packed = packed * VENUE_RANGE + routine.venue;
  packed = packed * 2 + (routine.entranceOnRight ? 1 : 0);
  packed = packed * 2 + (routine.lunchHandled ? 1 : 0);
  return packed * PHASE_RANGE + phase;
}

export function decodeRoutine(trip: number): OfficeRoutine | null {
  if (trip === NO_TRIP) return null;
  const phase = PHASES[(trip % PHASE_RANGE) - 1];
  if (!phase) return null;
  let rest = Math.floor(trip / PHASE_RANGE);
  const lunchHandled = rest % 2 === 1;
  rest = Math.floor(rest / 2);
  const entranceOnRight = rest % 2 === 1;
  rest = Math.floor(rest / 2);
  const venue = rest % VENUE_RANGE;
  const times = Math.floor(rest / VENUE_RANGE);
  return {
    phase,
    lunchHandled,
    entranceOnRight,
    venue,
    lunchMinute: Math.floor(times / MINUTES_PER_DAY),
    leaveMinute: times % MINUTES_PER_DAY,
  };
}

/** The routine of the person in this slot, or null while they have none. */
export function routineAt(pool: PersonPool, slot: number): OfficeRoutine | null {
  return decodeRoutine(pool.trip[slot] ?? NO_TRIP);
}

const OFFICE_WORKER_KIND = PERSON_KINDS.indexOf('officeWorker');

function isOfficeWorker(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === OFFICE_WORKER_KIND;
}

function minuteStep(dayStart: number, minute: number): number {
  return dayStart + minute * STEPS_PER_MINUTE;
}

function stayOutside(pool: PersonPool, slot: number): void {
  pool.trip[slot] = NO_TRIP;
  pool.dueStep[slot] = NOTHING_DUE;
}

/**
 * Draws today's plan for every office worker (people spec 6.1): arrival, lunch departure and
 * leave time, in that order, in increasing person id. On weekends the plan is empty.
 */
function drawPlans(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const pool = state.people;
  const worksToday = !isWeekendDay(occurrence.weekday);
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isOfficeWorker(pool, slot)) continue;
    stayOutside(pool, slot);
    if (!worksToday) continue;
    const arrivalMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_ARRIVAL);
    const lunchMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_LUNCH_DEPARTURE);
    const leaveMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_LEAVE);
    pool.trip[slot] = encodeRoutine({
      phase: 'waitingToArrive',
      lunchHandled: false,
      entranceOnRight: false,
      venue: 0,
      lunchMinute,
      leaveMinute,
    });
    pool.dueStep[slot] = minuteStep(occurrence.step, arrivalMinute);
  }
}

function mainLobbyEnds(state: TowerState): { left: number; right: number } | null {
  let left: number | null = null;
  let right: number | null = null;
  for (const span of state.grid.levels[1]?.structure ?? []) {
    if (span.kind !== 'lobby') continue;
    left = left === null ? span.x0 : Math.min(left, span.x0);
    right = right === null ? span.x1 : Math.max(right, span.x1);
  }
  return left === null || right === null ? null : { left, right };
}

function entrancePlace(state: TowerState, onRight: boolean): Place | null {
  const ends = mainLobbyEnds(state);
  if (!ends) return null;
  return { level: 1, column: onRight ? ends.right : ends.left };
}

function isFastFoodOpen(minuteOfDay: number): boolean {
  return minuteOfDay >= FAST_FOOD_HOURS.open && minuteOfDay < FAST_FOOD_HOURS.close;
}

function unitPlace(unit: Unit): Place {
  return { level: unit.level, column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width / 2) };
}

/** People eating at each fast food right now, by unit number. People still walking there do not count. */
function diners(pool: PersonPool): Map<number, number> {
  const counts = new Map<number, number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isOfficeWorker(pool, slot)) continue;
    const routine = routineAt(pool, slot);
    if (routine?.phase === 'atLunch')
      counts.set(routine.venue, (counts.get(routine.venue) ?? 0) + 1);
  }
  return counts;
}

function openFastFoods(state: TowerState, minuteOfDay: number): Unit[] {
  if (!isFastFoodOpen(minuteOfDay)) return [];
  const eating = diners(state.people);
  return Object.values(state.units)
    .filter((unit) => unit.type === 'fast-food')
    .filter((unit) => (eating.get(unitNumber(unit.id)) ?? 0) < FAST_FOOD_CAPACITY)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Draws up to three distinct venues; the cheapest reachable one wins, ties go to the lower id. */
function chooseFastFood(
  state: TowerState,
  routes: RoutePlanner,
  from: Place,
  minuteOfDay: number,
): { unit: Unit; steps: number } | null {
  const remaining = openFastFoods(state, minuteOfDay);
  const drawn: Unit[] = [];
  while (drawn.length < VENUE_CANDIDATES_DRAWN && remaining.length > 0) {
    const [picked] = remaining.splice(nextInt(state.rng, 0, remaining.length - 1), 1);
    if (picked) drawn.push(picked);
  }
  drawn.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  let best: { unit: Unit; steps: number } | null = null;
  for (const unit of drawn) {
    const steps = routes(state, from, unitPlace(unit));
    if (steps !== null && (best === null || steps < best.steps)) best = { unit, steps };
  }
  return best;
}

function venueUnit(state: TowerState, venue: number): Unit | null {
  return state.units[`u${venue}`] ?? null;
}

interface Worker {
  state: TowerState;
  slot: number;
  routine: OfficeRoutine;
  desk: Place;
  dayStart: number;
}

function save(worker: Worker, dueStep: number): void {
  const pool = worker.state.people;
  pool.trip[worker.slot] = encodeRoutine(worker.routine);
  pool.dueStep[worker.slot] = dueStep;
}

function leaveStep(worker: Worker): number {
  return minuteStep(worker.dayStart, worker.routine.leaveMinute);
}

function lunchStep(worker: Worker): number {
  return minuteStep(worker.dayStart, worker.routine.lunchMinute);
}

function giveUpArrival(worker: Worker): void {
  worker.routine.phase = 'givingUpArrival';
  save(worker, leaveStep(worker));
}

/** A required trip with no route is tried again later; if leave time comes first, the worker stays outside. */
function retryArrival(worker: Worker): void {
  const retryStep = worker.state.step + ROUTE_RETRY_STEPS;
  if (retryStep > leaveStep(worker)) {
    giveUpArrival(worker);
  } else {
    save(worker, retryStep);
  }
}

function startArrival(worker: Worker, routes: RoutePlanner): void {
  const { state, routine } = worker;
  routine.entranceOnRight = chance(state.rng, 0.5);
  const entrance = entrancePlace(state, routine.entranceOnRight);
  const steps = entrance ? routes(state, entrance, worker.desk) : null;
  if (steps === null) {
    retryArrival(worker);
    return;
  }
  const arrivesAt = state.step + steps;
  if (arrivesAt > leaveStep(worker)) {
    giveUpArrival(worker);
  } else {
    routine.phase = 'walkingIn';
    save(worker, arrivesAt);
  }
}

/** The worker is at the desk: wait for the lunch departure or the leave time, whichever is next. */
function settleAtOffice(worker: Worker): void {
  const { routine, state } = worker;
  routine.phase = 'atOffice';
  routine.venue = 0;
  if (!routine.lunchHandled && lunchStep(worker) < state.step) routine.lunchHandled = true;
  const next = routine.lunchHandled
    ? leaveStep(worker)
    : Math.min(lunchStep(worker), leaveStep(worker));
  save(worker, Math.max(next, state.step));
}

function minuteOfDay(worker: Worker): number {
  return Math.floor((worker.state.step - worker.dayStart) / STEPS_PER_MINUTE);
}

function startLunch(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  routine.lunchHandled = true;
  const goesOut = chance(state.rng, OFFICE_WORKER_LUNCH_CHANCE);
  const choice = goesOut ? chooseFastFood(state, routes, worker.desk, minuteOfDay(worker)) : null;
  if (!choice) {
    settleAtOffice(worker);
    return;
  }
  routine.phase = 'toLunch';
  routine.venue = unitNumber(choice.unit.id);
  save(worker, state.step + choice.steps);
}

function startLeaving(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  for (const onRight of [routine.entranceOnRight, !routine.entranceOnRight]) {
    const exit = entrancePlace(state, onRight);
    const steps = exit ? routes(state, worker.desk, exit) : null;
    if (steps !== null) {
      routine.phase = 'leaving';
      save(worker, state.step + steps);
      return;
    }
  }
  save(worker, state.step + ROUTE_RETRY_STEPS);
}

/** The worker reached the fast food: enter if it is still open and has room, otherwise walk back. */
function arriveAtFastFood(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  const venue = venueUnit(state, routine.venue);
  const eating = diners(state.people).get(routine.venue) ?? 0;
  const canEnter =
    venue?.type === 'fast-food' &&
    isFastFoodOpen(minuteOfDay(worker)) &&
    eating < FAST_FOOD_CAPACITY;
  if (canEnter) {
    routine.phase = 'atLunch';
    save(worker, state.step + FAST_FOOD_LUNCH_MINUTES * STEPS_PER_MINUTE);
  } else {
    startReturn(worker, routes);
  }
}

function startReturn(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  const venue = venueUnit(state, routine.venue);
  const steps = routes(state, venue ? unitPlace(venue) : worker.desk, worker.desk);
  if (steps === null) {
    save(worker, state.step + ROUTE_RETRY_STEPS);
    return;
  }
  routine.phase = 'backFromLunch';
  save(worker, state.step + steps);
}

function atOfficeDue(worker: Worker, routes: RoutePlanner): void {
  const step = worker.state.step;
  if (step >= leaveStep(worker)) {
    startLeaving(worker, routes);
  } else if (!worker.routine.lunchHandled && step >= lunchStep(worker)) {
    startLunch(worker, routes);
  } else {
    settleAtOffice(worker);
  }
}

function advance(worker: Worker, routes: RoutePlanner): void {
  switch (worker.routine.phase) {
    case 'waitingToArrive':
      startArrival(worker, routes);
      break;
    case 'walkingIn':
    case 'backFromLunch':
      settleAtOffice(worker);
      break;
    case 'givingUpArrival':
    case 'leaving':
      stayOutside(worker.state.people, worker.slot);
      break;
    case 'atOffice':
      atOfficeDue(worker, routes);
      break;
    case 'toLunch':
      arriveAtFastFood(worker, routes);
      break;
    case 'atLunch':
      startReturn(worker, routes);
      break;
  }
}

function deskOf(pool: PersonPool, slot: number): Place {
  return { level: (pool.level[slot] ?? 1) as Level, column: pool.column[slot] ?? 0 };
}

function runWorker(context: StepContext, slot: number, routes: RoutePlanner): void {
  const { state } = context;
  const pool = state.people;
  if (!isOfficeWorker(pool, slot)) return;
  const dayStart = Math.floor(state.step / STEPS_PER_DAY) * STEPS_PER_DAY;
  const desk = deskOf(pool, slot);
  while (pool.dueStep[slot] === state.step) {
    const routine = routineAt(pool, slot);
    if (!routine) {
      stayOutside(pool, slot);
      return;
    }
    advance({ state, slot, routine, desk, dayStart }, routes);
  }
}

export interface OfficeRoutineSystems {
  planHook: ScheduledHook;
  system: SimulationSystem;
}

/** The daily 00:00 plan and the system that walks office workers through it (people spec 6). */
export function createOfficeRoutine(routes: RoutePlanner): OfficeRoutineSystems {
  return {
    planHook: {
      name: 'office-worker-plans',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: drawPlans,
    },
    system: createPeopleSystem((context, slot) => runWorker(context, slot, routes)),
  };
}
