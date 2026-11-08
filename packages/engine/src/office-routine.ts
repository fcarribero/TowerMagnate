import {
  FAST_FOOD_CAPACITY,
  FAST_FOOD_HOURS,
  FAST_FOOD_LUNCH_MINUTES,
  MEDICAL_CENTER_DAILY_VISITS,
  MEDICAL_VISIT_CHANCE,
  MEDICAL_VISIT_MINUTES,
  OFFICE_WORKER_ARRIVAL,
  OFFICE_WORKER_LEAVE,
  OFFICE_WORKER_LUNCH_CHANCE,
  OFFICE_WORKER_LUNCH_DEPARTURE,
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  UNIT_CATALOG,
  VENUE_CANDIDATES_DRAWN,
  type Level,
  type MedicalDay,
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
import { cancelTrek, isOnTrek, startTrek } from './trek';
import { addFailedSearch, hasPendingTrip, recordTrip } from './trip-ledger';
import { unitNumber } from './units';

export interface Place {
  level: Level;
  column: number;
}

/** Steps a trip takes between two places, or null when there is no route. */
export type RoutePlanner = (
  state: TowerState,
  from: Place,
  to: Place,
  context: StepContext,
) => number | null;

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
  | 'toMedical'
  | 'atMedical'
  | 'leaving';

const PHASES: readonly RoutinePhase[] = [
  'waitingToArrive',
  'walkingIn',
  'givingUpArrival',
  'atOffice',
  'toLunch',
  'atLunch',
  'backFromLunch',
  'toMedical',
  'atMedical',
  'leaving',
];

/** What one office worker is doing today, kept in the person's `trip` number. */
export interface OfficeRoutine {
  phase: RoutinePhase;
  lunchHandled: boolean;
  /** The street entrance used to come in, so the worker leaves by the same one. */
  entranceOnRight: boolean;
  /** Unit number of the fast food or medical center being visited, or 0. */
  venue: number;
  /** Whether the worker goes to a medical center before leaving. */
  medical: boolean;
  lunchMinute: number;
  leaveMinute: number;
}

const MINUTES_PER_DAY = 24 * 60;
const VENUE_RANGE = 1_000_000;
const PHASE_RANGE = 16;
/** Everything packed below the medical flag, which sits on top so older saves still decode. */
const PACKED_RANGE = MINUTES_PER_DAY * MINUTES_PER_DAY * VENUE_RANGE * 2 * 2 * PHASE_RANGE;

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodeRoutine(routine: OfficeRoutine): number {
  const phase = PHASES.indexOf(routine.phase) + 1;
  let packed = routine.lunchMinute * MINUTES_PER_DAY + routine.leaveMinute;
  packed = packed * VENUE_RANGE + routine.venue;
  packed = packed * 2 + (routine.entranceOnRight ? 1 : 0);
  packed = packed * 2 + (routine.lunchHandled ? 1 : 0);
  return (routine.medical ? PACKED_RANGE : 0) + packed * PHASE_RANGE + phase;
}

export function decodeRoutine(packedTrip: number): OfficeRoutine | null {
  if (packedTrip === NO_TRIP) return null;
  const medical = packedTrip >= PACKED_RANGE;
  const trip = medical ? packedTrip - PACKED_RANGE : packedTrip;
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
    medical,
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

/** Marks the worker as having nothing to do until the next daily plan. */
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
    if (isOnTrek(pool, slot)) cancelTrek(context, slot);
    stayOutside(pool, slot);
    if (!worksToday) continue;
    const arrivalMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_ARRIVAL);
    const lunchMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_LUNCH_DEPARTURE);
    const leaveMinute = drawMinuteFromWindow(state.rng, OFFICE_WORKER_LEAVE);
    const medical = state.stars >= 3 && chance(state.rng, MEDICAL_VISIT_CHANCE);
    pool.trip[slot] = encodeRoutine({
      phase: 'waitingToArrive',
      lunchHandled: false,
      entranceOnRight: false,
      venue: 0,
      medical,
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

export function entrancePlace(state: TowerState, onRight: boolean): Place | null {
  const ends = mainLobbyEnds(state);
  if (!ends) return null;
  return { level: 1, column: onRight ? ends.right : ends.left };
}

function isFastFoodOpen(minuteOfDay: number): boolean {
  return minuteOfDay >= FAST_FOOD_HOURS.open && minuteOfDay < FAST_FOOD_HOURS.close;
}

export function unitPlace(unit: Unit): Place {
  return { level: unit.level, column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width / 2) };
}

interface DinerCount {
  step: number;
  byVenue: Map<number, number>;
}

const dinerCounts = new WeakMap<PersonPool, DinerCount>();

function countDiners(pool: PersonPool): Map<number, number> {
  const byVenue = new Map<number, number>();
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isOfficeWorker(pool, slot)) continue;
    const routine = routineAt(pool, slot);
    if (routine?.phase === 'atLunch')
      byVenue.set(routine.venue, (byVenue.get(routine.venue) ?? 0) + 1);
  }
  return byVenue;
}

/**
 * People eating at each fast food right now, by unit number. People still walking there do not
 * count. The count is built once per step and kept up to date as workers sit down and leave.
 */
function diners(state: TowerState): Map<number, number> {
  const cached = dinerCounts.get(state.people);
  if (cached && cached.step === state.step) return cached.byVenue;
  const byVenue = countDiners(state.people);
  dinerCounts.set(state.people, { step: state.step, byVenue });
  return byVenue;
}

/** Office workers eating at this fast food right now. */
export function officeDinersAt(state: TowerState, venue: number): number {
  return diners(state).get(venue) ?? 0;
}

function changeDiners(state: TowerState, venue: number, change: number): void {
  const byVenue = diners(state);
  byVenue.set(venue, Math.max(0, (byVenue.get(venue) ?? 0) + change));
}

function openFastFoods(state: TowerState, minuteOfDay: number): Unit[] {
  if (!isFastFoodOpen(minuteOfDay)) return [];
  const eating = diners(state);
  return Object.values(state.units)
    .filter((unit) => unit.type === 'fast-food')
    .filter((unit) => (eating.get(unitNumber(unit.id)) ?? 0) < FAST_FOOD_CAPACITY)
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Draws up to three distinct venues; the cheapest reachable one wins, ties go to the lower id. */
function chooseVenue(
  context: StepContext,
  state: TowerState,
  routes: RoutePlanner,
  from: Place,
  candidates: Unit[],
): { unit: Unit; steps: number } | null {
  const remaining = [...candidates];
  const drawn: Unit[] = [];
  while (drawn.length < VENUE_CANDIDATES_DRAWN && remaining.length > 0) {
    const [picked] = remaining.splice(nextInt(state.rng, 0, remaining.length - 1), 1);
    if (picked) drawn.push(picked);
  }
  drawn.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  let best: { unit: Unit; steps: number } | null = null;
  for (const unit of drawn) {
    const steps = routes(state, from, unitPlace(unit), context);
    if (steps !== null && (best === null || steps < best.steps)) best = { unit, steps };
  }
  return best;
}

function venueUnit(state: TowerState, venue: number): Unit | null {
  return state.units[`u${venue}`] ?? null;
}

interface Worker {
  context: StepContext;
  state: TowerState;
  /** Whether trips are walked by the trek system or only timed by the route planner. */
  treks: boolean;
  slot: number;
  routine: OfficeRoutine;
  desk: Place;
  dayStart: number;
}

/**
 * Starts a trip that ends in `phase`. With treks the person walks it step by step and is due
 * when they arrive; without, the planner's step count is the whole trip. When there is no
 * route the phase is put back and false is returned.
 */
function beginTravel(
  worker: Worker,
  phase: RoutinePhase,
  from: Place,
  to: Place,
  estimatedSteps: number,
): boolean {
  const { state, slot, routine } = worker;
  if (!worker.treks) {
    routine.phase = phase;
    save(worker, state.step + estimatedSteps);
    return true;
  }
  const pool = state.people;
  const previous = routine.phase;
  routine.phase = phase;
  pool.level[slot] = from.level;
  pool.column[slot] = from.column;
  save(worker, NOTHING_DUE);
  if (startTrek(worker.context, slot, to)) return true;
  routine.phase = previous;
  pool.trip[slot] = encodeRoutine(routine);
  return false;
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

/** A failed search of a required trip counts toward its stress, and the trip ends when it is given up. */
function countFailedSearch(worker: Worker): void {
  if (worker.treks) addFailedSearch(worker.state.people, worker.slot);
}

function giveUpArrival(worker: Worker): void {
  const { state, slot } = worker;
  if (worker.treks && hasPendingTrip(state.people, slot)) recordTrip(state, slot);
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
  const steps = entrance ? routes(state, entrance, worker.desk, worker.context) : null;
  if (!entrance || steps === null) {
    countFailedSearch(worker);
    retryArrival(worker);
    return;
  }
  if (state.step + steps > leaveStep(worker)) {
    giveUpArrival(worker);
  } else if (!beginTravel(worker, 'walkingIn', entrance, worker.desk, steps)) {
    countFailedSearch(worker);
    retryArrival(worker);
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
  const choice = goesOut
    ? chooseVenue(
        worker.context,
        state,
        routes,
        worker.desk,
        openFastFoods(state, minuteOfDay(worker)),
      )
    : null;
  if (!choice) {
    settleAtOffice(worker);
    return;
  }
  const previousVenue = routine.venue;
  routine.venue = unitNumber(choice.unit.id);
  if (!beginTravel(worker, 'toLunch', worker.desk, unitPlace(choice.unit), choice.steps)) {
    routine.venue = previousVenue;
    settleAtOffice(worker);
  }
}

function startLeaving(worker: Worker, routes: RoutePlanner, from: Place = worker.desk): void {
  const { routine, state } = worker;
  if (routine.medical) {
    routine.medical = false;
    if (startMedicalVisit(worker, routes)) return;
  }
  for (const onRight of [routine.entranceOnRight, !routine.entranceOnRight]) {
    const exit = entrancePlace(state, onRight);
    const steps = exit ? routes(state, from, exit, worker.context) : null;
    if (exit && steps !== null && beginTravel(worker, 'leaving', from, exit, steps)) return;
  }
  save(worker, state.step + ROUTE_RETRY_STEPS);
}

function medicalCenters(state: TowerState): Unit[] {
  return Object.values(state.units).filter((unit) => unit.type === 'medical-center');
}

/** Today's visit counts and notices; a new day starts them over. */
function medicalDay(state: TowerState): MedicalDay {
  const day = Math.floor(state.step / STEPS_PER_DAY);
  if (state.medicalDay.day !== day) state.medicalDay = { day, visits: {}, noticed: [] };
  return state.medicalDay;
}

function hasRoomToday(state: TowerState, center: number): boolean {
  return (medicalDay(state).visits[center] ?? 0) < MEDICAL_CENTER_DAILY_VISITS;
}

function centersWithRoom(state: TowerState): Unit[] {
  return medicalCenters(state)
    .filter((unit) => hasRoomToday(state, unitNumber(unit.id)))
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** Records the failed visit for the star check and shows the notice once a day. */
function failMedicalVisit(worker: Worker, full: boolean): void {
  const { state, context } = worker;
  state.lastMedicalFailureStep = state.step;
  const key = full ? 'news.medicalFull' : 'news.medicalDemanded';
  const today = medicalDay(state);
  if (today.noticed.includes(key)) return;
  today.noticed.push(key);
  context.events.push({ type: 'news', step: state.step, key, unitId: null });
}

/** Sends the worker to a medical center; on failure it is recorded and the worker goes home. */
function startMedicalVisit(worker: Worker, routes: RoutePlanner): boolean {
  const { state, routine } = worker;
  const open = centersWithRoom(state);
  const choice = chooseVenue(worker.context, state, routes, worker.desk, open);
  if (choice) {
    const previousVenue = routine.venue;
    routine.venue = unitNumber(choice.unit.id);
    if (beginTravel(worker, 'toMedical', worker.desk, unitPlace(choice.unit), choice.steps)) {
      return true;
    }
    routine.venue = previousVenue;
  }
  failMedicalVisit(worker, open.length === 0 && medicalCenters(state).length > 0);
  return false;
}

/** The worker reached the center: enter if it still has room, otherwise the visit fails. */
function arriveAtMedicalCenter(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  const center = venueUnit(state, routine.venue);
  if (center?.type === 'medical-center' && hasRoomToday(state, routine.venue)) {
    routine.phase = 'atMedical';
    const today = medicalDay(state);
    today.visits[routine.venue] = (today.visits[routine.venue] ?? 0) + 1;
    save(worker, state.step + MEDICAL_VISIT_MINUTES * STEPS_PER_MINUTE);
    return;
  }
  failMedicalVisit(worker, center?.type === 'medical-center');
  startLeaving(worker, routes, center ? unitPlace(center) : worker.desk);
}

function leaveMedicalCenter(worker: Worker, routes: RoutePlanner): void {
  const center = venueUnit(worker.state, worker.routine.venue);
  startLeaving(worker, routes, center ? unitPlace(center) : worker.desk);
}

/** The worker reached the fast food: enter if it is still open and has room, otherwise walk back. */
function arriveAtFastFood(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  const venue = venueUnit(state, routine.venue);
  const eating = diners(state).get(routine.venue) ?? 0;
  const canEnter =
    venue?.type === 'fast-food' &&
    isFastFoodOpen(minuteOfDay(worker)) &&
    eating < FAST_FOOD_CAPACITY;
  if (canEnter) {
    routine.phase = 'atLunch';
    changeDiners(state, routine.venue, 1);
    save(worker, state.step + FAST_FOOD_LUNCH_MINUTES * STEPS_PER_MINUTE);
  } else {
    startReturn(worker, routes);
  }
}

function startReturn(worker: Worker, routes: RoutePlanner): void {
  const { routine, state } = worker;
  const venue = venueUnit(state, routine.venue);
  const from = venue ? unitPlace(venue) : worker.desk;
  const steps = routes(state, from, worker.desk, worker.context);
  if (steps === null || !beginTravel(worker, 'backFromLunch', from, worker.desk, steps)) {
    save(worker, state.step + ROUTE_RETRY_STEPS);
  }
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
    case 'toMedical':
      arriveAtMedicalCenter(worker, routes);
      break;
    case 'atMedical':
      leaveMedicalCenter(worker, routes);
      break;
    case 'atLunch':
      changeDiners(worker.state, worker.routine.venue, -1);
      startReturn(worker, routes);
      break;
  }
}

/** Where the worker's desk is. Without treks the person never moves, so their cell is the desk. */
function deskOf(state: TowerState, slot: number, treks: boolean): Place {
  const pool = state.people;
  const home = treks ? state.units[`u${pool.homeUnit[slot]}`] : undefined;
  if (home) return unitPlace(home);
  return { level: (pool.level[slot] ?? 1) as Level, column: pool.column[slot] ?? 0 };
}

function runWorker(context: StepContext, slot: number, routes: RoutePlanner, treks: boolean): void {
  const { state } = context;
  const pool = state.people;
  if (!isOfficeWorker(pool, slot)) return;
  const dayStart = Math.floor(state.step / STEPS_PER_DAY) * STEPS_PER_DAY;
  const desk = deskOf(state, slot, treks);
  while (pool.dueStep[slot] === state.step) {
    const routine = routineAt(pool, slot);
    if (!routine) {
      stayOutside(pool, slot);
      return;
    }
    advance({ context, state, treks, slot, routine, desk, dayStart }, routes);
  }
}

export interface OfficeRoutineSystems {
  planHook: ScheduledHook;
  system: SimulationSystem;
}

/** The daily 00:00 plan and the system that walks office workers through it (people spec 6). */
export function createOfficeRoutine(
  routes: RoutePlanner,
  options: { treks?: boolean } = {},
): OfficeRoutineSystems {
  const treks = options.treks ?? false;
  return {
    planHook: {
      name: 'office-worker-plans',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: drawPlans,
    },
    system: createPeopleSystem((context, slot) => runWorker(context, slot, routes, treks)),
  };
}
