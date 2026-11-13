import {
  PERSON_KINDS,
  RESIDENT_LEAVE,
  RESIDENT_BED,
  RESIDENT_RETAIL_TRIP_CHANCE,
  RESIDENT_RETURN,
  RESIDENT_SATURDAY_WORKDAY_CHANCE,
  RESIDENT_WAKE,
  RESIDENT_WEEKDAY_DINNER,
  RESIDENT_WEEKDAY_DINNER_CHANCE,
  RESIDENT_WEEKDAY_SHOPPING,
  RESIDENT_WEEKDAY_SHOPPING_CHANCE,
  RESIDENT_WEEKEND_AFTERNOON,
  RESIDENT_WEEKEND_AFTERNOON_CHANCE,
  RESIDENT_WEEKEND_BED,
  RESIDENT_WEEKEND_DINNER,
  RESIDENT_WEEKEND_DINNER_CHANCE,
  RESIDENT_WEEKEND_MORNING,
  RESIDENT_WEEKEND_MORNING_CHANCE,
  RESIDENT_WEEKEND_WAKE,
  RESIDENT_WORKDAY_CHANCE,
  RETAIL_PRICE_ATTRACTION,
  ROUTE_RETRY_STEPS,
  VENUE_CANDIDATES_DRAWN,
  VENUE_CAPACITY,
  VENUE_HOURS,
  VENUE_VISIT_MINUTES,
  type PersonPool,
  type TowerState,
  type Unit,
  type VisitedVenueType,
  type WindowPart,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE, WEEKDAYS } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  entrancePlace,
  officeDinersAt,
  unitPlace,
  type Place,
  type RoutePlanner,
} from './office-routine';
import { createPeopleSystem, NO_TRIP, NOTHING_DUE } from './people';
import { chance, nextInt } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import { drawBedStep, drawWakeDelay, drawWakeStep, type SleepWindows } from './sleep';
import type { SimulationSystem, StepContext } from './step';
import { drawMinuteFromWindow } from './time-windows';
import { cancelTrek, isOnTrek, startTrek } from './trek';
import { isGuestAtVenue } from './hotel-guest-trip';
import { stressOfTripEndedNow } from './trip-ledger';
import { fileShopVisit } from './unit-evaluation';
import { unitNumber } from './units';
import { customersInsideVenue } from './venue-visitors';
import { countVenueVisit } from './venues';

export type ResidentPlanKind = 'works' | 'staysHome' | 'weekend';

export type ResidentPhase =
  'home' | 'toExit' | 'outside' | 'toHome' | 'toVenue' | 'atVenue' | 'fromVenue' | 'sleeping';

const PLAN_KINDS: readonly ResidentPlanKind[] = ['works', 'staysHome', 'weekend'];

/**
 * Phases stored as their index plus one. `sleeping` is stored as 0, the one code the packing
 * leaves free, so saves made before sleep existed still read the same.
 */
const PHASES: readonly ResidentPhase[] = [
  'home',
  'toExit',
  'outside',
  'toHome',
  'toVenue',
  'atVenue',
  'fromVenue',
];

/** The three timed intentions of a day. A value is a minute of the day plus one; 0 means none left. */
export type IntentionMinutes = readonly [number, number, number];

/** What one resident is doing today, kept in the person's `trip` number (people spec 7). */
export interface ResidentRoutine {
  plan: ResidentPlanKind;
  phase: ResidentPhase;
  /** Unit number of the venue being visited, or 0. */
  venue: number;
  /**
   * Weekdays out: leave, return, dinner. Weekdays at home: shopping, unused, dinner.
   * Weekends: morning trip, afternoon trip, dinner.
   */
  slots: IntentionMinutes;
}

type Intention = 'leave' | 'return' | 'outing' | 'dinner';

interface PendingIntention {
  index: number;
  slotValue: number;
  kind: Intention;
}

const SLOT_RANGE = 1441;
const VENUE_RANGE = 100_000;
const PHASE_RANGE = 8;
const SLEEPING_CODE = 0;
/** A sleeping routine keeps this venue so that its packed number is never 0, which means no trip. */
const SLEEPING_MARK = 1;

const BED_WINDOWS: SleepWindows = { usual: RESIDENT_BED, long: RESIDENT_WEEKEND_BED };
const WAKE_WINDOWS: SleepWindows = { usual: RESIDENT_WAKE, long: RESIDENT_WEEKEND_WAKE };
const NO_SLOT = 0;
const RESIDENT_KIND = PERSON_KINDS.indexOf('resident');
const RETURN_SLOT = 1;

const INTENTIONS: Readonly<Record<ResidentPlanKind, readonly [Intention, Intention, Intention]>> = {
  works: ['leave', 'return', 'dinner'],
  staysHome: ['outing', 'outing', 'dinner'],
  weekend: ['outing', 'outing', 'dinner'],
};

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodeResidentRoutine(routine: ResidentRoutine): number {
  const [first, second, third] = routine.slots;
  let packed = PLAN_KINDS.indexOf(routine.plan);
  packed = ((packed * SLOT_RANGE + first) * SLOT_RANGE + second) * SLOT_RANGE + third;
  const sleeping = routine.phase === 'sleeping';
  packed = packed * VENUE_RANGE + (sleeping ? SLEEPING_MARK : routine.venue);
  return packed * PHASE_RANGE + (sleeping ? SLEEPING_CODE : PHASES.indexOf(routine.phase) + 1);
}

export function decodeResidentRoutine(trip: number): ResidentRoutine | null {
  if (trip === NO_TRIP) return null;
  const code = trip % PHASE_RANGE;
  const phase = code === SLEEPING_CODE ? 'sleeping' : PHASES[code - 1];
  if (!phase) return null;
  let rest = Math.floor(trip / PHASE_RANGE);
  const venue = phase === 'sleeping' ? 0 : rest % VENUE_RANGE;
  rest = Math.floor(rest / VENUE_RANGE);
  const third = rest % SLOT_RANGE;
  rest = Math.floor(rest / SLOT_RANGE);
  const second = rest % SLOT_RANGE;
  rest = Math.floor(rest / SLOT_RANGE);
  const first = rest % SLOT_RANGE;
  const plan = PLAN_KINDS[Math.floor(rest / SLOT_RANGE)];
  if (!plan) return null;
  return { plan, phase, venue, slots: [first, second, third] };
}

function isResident(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === RESIDENT_KIND;
}

function stepOfSlot(dayStart: number, slotValue: number): number {
  return dayStart + (slotValue - 1) * STEPS_PER_MINUTE;
}

function windowSlot(state: TowerState, parts: readonly WindowPart[]): number {
  return drawMinuteFromWindow(state.rng, parts) + 1;
}

function withSlot(slots: IntentionMinutes, index: number, value: number): IntentionMinutes {
  const next: [number, number, number] = [slots[0], slots[1], slots[2]];
  next[index] = value;
  return next;
}

function drawWorksPlan(state: TowerState): { plan: ResidentPlanKind; slots: IntentionMinutes } {
  const first = windowSlot(state, RESIDENT_LEAVE);
  const second = windowSlot(state, RESIDENT_RETURN);
  const dinner = chance(state.rng, RESIDENT_WEEKDAY_DINNER_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKDAY_DINNER)
    : NO_SLOT;
  return { plan: 'works', slots: [first, second, dinner] };
}

function drawWeekdayPlan(state: TowerState): { plan: ResidentPlanKind; slots: IntentionMinutes } {
  if (chance(state.rng, RESIDENT_WORKDAY_CHANCE)) return drawWorksPlan(state);
  const first = chance(state.rng, RESIDENT_WEEKDAY_SHOPPING_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKDAY_SHOPPING)
    : NO_SLOT;
  const dinner = chance(state.rng, RESIDENT_WEEKDAY_DINNER_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKDAY_DINNER)
    : NO_SLOT;
  return { plan: 'staysHome', slots: [first, NO_SLOT, dinner] };
}

/** Saturday: some residents work with the weekday windows, the rest follow the weekend plan. */
function drawSaturdayPlan(state: TowerState): { plan: ResidentPlanKind; slots: IntentionMinutes } {
  return chance(state.rng, RESIDENT_SATURDAY_WORKDAY_CHANCE)
    ? drawWorksPlan(state)
    : drawWeekendPlan(state);
}

function drawWeekendPlan(state: TowerState): { plan: ResidentPlanKind; slots: IntentionMinutes } {
  const morning = chance(state.rng, RESIDENT_WEEKEND_MORNING_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKEND_MORNING)
    : NO_SLOT;
  const afternoon = chance(state.rng, RESIDENT_WEEKEND_AFTERNOON_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKEND_AFTERNOON)
    : NO_SLOT;
  const dinner = chance(state.rng, RESIDENT_WEEKEND_DINNER_CHANCE)
    ? windowSlot(state, RESIDENT_WEEKEND_DINNER)
    : NO_SLOT;
  return { plan: 'weekend', slots: [morning, afternoon, dinner] };
}

function homeUnitOf(state: TowerState, slot: number): Unit | null {
  const unitId = `u${state.people.homeUnit[slot]}`;
  return Object.hasOwn(state.units, unitId) ? (state.units[unitId] ?? null) : null;
}

/** The pending intention with the earliest time, or null when the day's plan is used up. */
function nextIntention(routine: ResidentRoutine): PendingIntention | null {
  let best: PendingIntention | null = null;
  routine.slots.forEach((slotValue, index) => {
    if (slotValue === NO_SLOT) return;
    if (best === null || slotValue < best.slotValue) {
      best = { index, slotValue, kind: INTENTIONS[routine.plan][index] as Intention };
    }
  });
  return best;
}

/**
 * The resident is home with nothing running. Intentions whose time passed while they were away
 * are skipped (people spec 7.2); then they wait for the next one. With none left they wait for
 * a bed time drawn now.
 */
function settleHome(
  state: TowerState,
  slot: number,
  routine: ResidentRoutine,
  dayStart: number,
  now: number,
): void {
  const pool = state.people;
  routine.phase = 'home';
  routine.venue = 0;
  let next = nextIntention(routine);
  while (next && stepOfSlot(dayStart, next.slotValue) < now) {
    routine.slots = withSlot(routine.slots, next.index, NO_SLOT);
    next = nextIntention(routine);
  }
  pool.trip[slot] = encodeResidentRoutine(routine);
  pool.dueStep[slot] = next
    ? stepOfSlot(dayStart, next.slotValue)
    : drawBedStep(state, now, BED_WINDOWS);
}

/**
 * A resident at home who is awake and waiting for bed time rather than for an intention: the due
 * step is not the time of their next intention.
 */
function bedTimeOf(pool: PersonPool, slot: number, dayStart: number): number | null {
  const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
  const due = pool.dueStep[slot] as number;
  if (routine?.phase !== 'home' || due === NOTHING_DUE) return null;
  const next = nextIntention(routine);
  return next && stepOfSlot(dayStart, next.slotValue) === due ? null : due;
}

function drawDayPlan(state: TowerState, weekday: HookOccurrence['weekday']) {
  if (weekday === WEEKDAYS.saturday) return drawSaturdayPlan(state);
  return isWeekendDay(weekday) ? drawWeekendPlan(state) : drawWeekdayPlan(state);
}

/**
 * Draws today's plan for every resident (people spec 7), in increasing person id. Anyone still
 * out from yesterday is put back in the condo first, awake. A sleeper keeps sleeping and a
 * resident waiting for bed time keeps that time; their plan starts after they wake.
 */
function drawPlans(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isResident(pool, slot)) continue;
    const before = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
    const sleeping = before?.phase === 'sleeping';
    const keptBed = sleeping ? null : bedTimeOf(pool, slot, occurrence.step - STEPS_PER_DAY);
    const keptWake = sleeping ? (pool.dueStep[slot] as number) : null;
    if (!sleeping && keptBed === null && isOnTrek(pool, slot)) cancelTrek(context, slot);
    const home = homeUnitOf(state, slot);
    if (!home) {
      pool.trip[slot] = NO_TRIP;
      pool.dueStep[slot] = NOTHING_DUE;
      continue;
    }
    if (!sleeping) {
      const place = unitPlace(home);
      pool.level[slot] = place.level;
      pool.column[slot] = place.column;
    }
    const drawn = drawDayPlan(state, occurrence.weekday);
    const routine: ResidentRoutine = { ...drawn, phase: 'home', venue: 0 };
    if (keptWake !== null) {
      routine.phase = 'sleeping';
      pool.trip[slot] = encodeResidentRoutine(routine);
      pool.dueStep[slot] = keptWake;
      continue;
    }
    settleHome(state, slot, routine, occurrence.step, occurrence.step);
    if (keptBed !== null) pool.dueStep[slot] = keptBed;
    else if (nextIntention(routine)) {
      pool.dueStep[slot] = drawBedStep(state, occurrence.step, BED_WINDOWS);
    }
  }
}

interface Resident {
  context: StepContext;
  state: TowerState;
  /** Whether trips are walked by the trek system or only timed by the route planner. */
  treks: boolean;
  slot: number;
  routine: ResidentRoutine;
  home: Place;
  dayStart: number;
  routes: RoutePlanner;
}

function save(resident: Resident, dueStep: number): void {
  const pool = resident.state.people;
  pool.trip[resident.slot] = encodeResidentRoutine(resident.routine);
  pool.dueStep[resident.slot] = dueStep;
}

function settle(resident: Resident): void {
  const { state, slot, routine, dayStart } = resident;
  settleHome(state, slot, routine, dayStart, state.step);
}

function arriveAt(resident: Resident, place: Place): void {
  const pool = resident.state.people;
  pool.level[resident.slot] = place.level;
  pool.column[resident.slot] = place.column;
}

/**
 * Starts a trip that ends in `phase`. With treks the person walks it and is due on arrival;
 * without, the planner's step count is the whole trip. With no route the phase is put back and
 * false is returned.
 */
function beginTravel(
  resident: Resident,
  phase: ResidentPhase,
  from: Place,
  to: Place,
  estimatedSteps: number,
): boolean {
  const { state, slot, routine } = resident;
  const previous = routine.phase;
  routine.phase = phase;
  arriveAt(resident, from);
  if (!resident.treks) {
    save(resident, state.step + estimatedSteps);
    return true;
  }
  save(resident, NOTHING_DUE);
  if (startTrek(resident.context, slot, to)) return true;
  routine.phase = previous;
  state.people.trip[slot] = encodeResidentRoutine(routine);
  return false;
}

function minuteOfDay(resident: Resident): number {
  return Math.floor((resident.state.step - resident.dayStart) / STEPS_PER_MINUTE);
}

function minuteOfStep(step: number): number {
  return Math.floor((step % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

export function isVenueOpen(type: VisitedVenueType, minute: number): boolean {
  const hours = VENUE_HOURS[type];
  return minute >= hours.open && minute < hours.close;
}

/** Everyone inside the venue right now: office diners, residents, hotel guests and outside customers. */
export function visitorsAt(state: TowerState, type: VisitedVenueType, venue: number): number {
  const pool = state.people;
  let count = type === 'fast-food' ? officeDinersAt(state, venue) : 0;
  count += customersInsideVenue(state, venue);
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isGuestAtVenue(pool, slot, venue)) count += 1;
    if (!isResident(pool, slot)) continue;
    const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
    if (routine?.phase === 'atVenue' && routine.venue === venue) count += 1;
  }
  return count;
}

export function venueHasRoom(state: TowerState, unit: Unit, type: VisitedVenueType): boolean {
  return visitorsAt(state, type, unitNumber(unit.id)) < VENUE_CAPACITY[type];
}

function openVenues(state: TowerState, type: VisitedVenueType, minute: number): Unit[] {
  if (!isVenueOpen(type, minute)) return [];
  return Object.values(state.units)
    .filter((unit) => unit.type === type)
    .filter((unit) => type !== 'retail-shop' || unit.lease !== null)
    .filter((unit) => venueHasRoom(state, unit, type))
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

function attraction(unit: Unit): number {
  return unit.type === 'retail-shop' ? RETAIL_PRICE_ATTRACTION[unit.priceLevel] : 1;
}

function drawByAttraction(state: TowerState, units: readonly Unit[]): Unit {
  const total = units.reduce((sum, unit) => sum + attraction(unit), 0);
  let target = (nextInt(state.rng, 1, 1000) / 1000) * total;
  for (const unit of units) {
    target -= attraction(unit);
    if (target <= 0) return unit;
  }
  return units[units.length - 1] as Unit;
}

/** True when at least one venue of the type is open and not full right now (people spec 5). */
export function hasVenueCandidate(state: TowerState, type: VisitedVenueType): boolean {
  return openVenues(state, type, minuteOfStep(state.step)).length > 0;
}

/**
 * Draws up to three distinct open venues by attraction; the cheapest reachable one from `from`
 * wins, ties go to the lower id (people spec 5).
 */
export function chooseVenue(
  context: StepContext,
  routes: RoutePlanner,
  from: Place,
  type: VisitedVenueType,
): { unit: Unit; steps: number } | null {
  const { state } = context;
  const remaining = openVenues(state, type, minuteOfStep(state.step));
  const drawn: Unit[] = [];
  while (drawn.length < VENUE_CANDIDATES_DRAWN && remaining.length > 0) {
    const picked = drawByAttraction(state, remaining);
    remaining.splice(remaining.indexOf(picked), 1);
    drawn.push(picked);
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

function drawVenueType(resident: Resident, kind: Intention): VisitedVenueType {
  if (kind === 'dinner') return 'restaurant';
  return chance(resident.state.rng, RESIDENT_RETAIL_TRIP_CHANCE) ? 'retail-shop' : 'fast-food';
}

function startVisit(resident: Resident, kind: Intention): void {
  const type = drawVenueType(resident, kind);
  const choice = chooseVenue(resident.context, resident.routes, resident.home, type);
  if (!choice) {
    settle(resident);
    return;
  }
  resident.routine.venue = unitNumber(choice.unit.id);
  if (!beginTravel(resident, 'toVenue', resident.home, unitPlace(choice.unit), choice.steps)) {
    settle(resident);
  }
}

/** A resident who cannot get out stays home and skips the evening return as well. */
function startLeaving(resident: Resident): void {
  const { state, routine } = resident;
  const exit = entrancePlace(state, chance(state.rng, 0.5));
  const steps = exit ? resident.routes(state, resident.home, exit, resident.context) : null;
  if (exit && steps !== null && beginTravel(resident, 'toExit', resident.home, exit, steps)) return;
  routine.slots = withSlot(routine.slots, RETURN_SLOT, NO_SLOT);
  settle(resident);
}

/** The way home is required, so with no route it is tried again later. */
function startReturnHome(resident: Resident): void {
  const { state, routine } = resident;
  const entrance = entrancePlace(state, chance(state.rng, 0.5));
  const steps = entrance ? resident.routes(state, entrance, resident.home, resident.context) : null;
  routine.slots = withSlot(routine.slots, RETURN_SLOT, NO_SLOT);
  const walking =
    entrance !== null &&
    steps !== null &&
    beginTravel(resident, 'toHome', entrance, resident.home, steps);
  if (walking) return;
  routine.phase = 'outside';
  save(resident, state.step + ROUTE_RETRY_STEPS);
}

function startWalkHome(resident: Resident, from: Place): void {
  const steps = resident.routes(resident.state, from, resident.home, resident.context);
  if (steps === null || !beginTravel(resident, 'fromVenue', from, resident.home, steps)) {
    save(resident, resident.state.step + ROUTE_RETRY_STEPS);
  }
}

/** The resident reached the venue: go in if it is still open and has room, otherwise walk home. */
function arriveAtVenue(resident: Resident): void {
  const { state, routine } = resident;
  const venue = venueUnit(state, routine.venue);
  if (venue) fileShopVisit(state, venue, state.people.id[resident.slot] as number);
  const type = venue?.type as VisitedVenueType | undefined;
  if (
    !venue ||
    !type ||
    !isVenueOpen(type, minuteOfDay(resident)) ||
    !venueHasRoom(state, venue, type)
  ) {
    startWalkHome(resident, venue ? unitPlace(venue) : resident.home);
    return;
  }
  arriveAt(resident, unitPlace(venue));
  countVenueVisit(state, venue, stressOfTripEndedNow(state, resident.slot), 'resident');
  routine.phase = 'atVenue';
  save(resident, state.step + VENUE_VISIT_MINUTES[type] * STEPS_PER_MINUTE);
}

/** A resident at home is due for their next intention, or else for bed. */
function intentionIsDue(resident: Resident): boolean {
  const next = nextIntention(resident.routine);
  return next !== null && stepOfSlot(resident.dayStart, next.slotValue) === resident.state.step;
}

function goToSleep(resident: Resident): void {
  const { state, routine } = resident;
  routine.phase = 'sleeping';
  routine.venue = 0;
  save(resident, drawWakeStep(state, state.step, WAKE_WINDOWS));
}

/** Nothing of the day's plan starts before the resident has been up for a while. */
function wakeUp(resident: Resident): void {
  const { state, routine, dayStart } = resident;
  const ready = state.step + drawWakeDelay(state);
  const readyMinute = Math.floor((ready - dayStart) / STEPS_PER_MINUTE) + 1;
  routine.slots = routine.slots.map((slotValue) =>
    slotValue !== NO_SLOT && stepOfSlot(dayStart, slotValue) < ready ? readyMinute : slotValue,
  ) as unknown as IntentionMinutes;
  settle(resident);
}

function startIntention(resident: Resident): void {
  const next = nextIntention(resident.routine);
  if (!next) {
    settle(resident);
    return;
  }
  resident.routine.slots = withSlot(resident.routine.slots, next.index, NO_SLOT);
  if (next.kind === 'leave') startLeaving(resident);
  else if (next.kind === 'return') settle(resident);
  else startVisit(resident, next.kind);
}

function finishExit(resident: Resident): void {
  const { routine, state } = resident;
  routine.phase = 'outside';
  const returnStep = stepOfSlot(resident.dayStart, routine.slots[RETURN_SLOT]);
  save(resident, Math.max(returnStep, state.step));
}

function advance(resident: Resident): void {
  const { routine, home } = resident;
  switch (routine.phase) {
    case 'home':
      if (intentionIsDue(resident)) startIntention(resident);
      else goToSleep(resident);
      break;
    case 'sleeping':
      wakeUp(resident);
      break;
    case 'toExit':
      finishExit(resident);
      break;
    case 'outside':
      startReturnHome(resident);
      break;
    case 'toHome':
    case 'fromVenue':
      arriveAt(resident, home);
      settle(resident);
      break;
    case 'toVenue':
      arriveAtVenue(resident);
      break;
    case 'atVenue': {
      const venue = venueUnit(resident.state, routine.venue);
      startWalkHome(resident, venue ? unitPlace(venue) : home);
      break;
    }
  }
}

function runResident(
  context: StepContext,
  slot: number,
  routes: RoutePlanner,
  treks: boolean,
): void {
  const { state } = context;
  const pool = state.people;
  if (!isResident(pool, slot)) return;
  const homeUnit = homeUnitOf(state, slot);
  const dayStart = Math.floor(state.step / STEPS_PER_DAY) * STEPS_PER_DAY;
  while (pool.dueStep[slot] === state.step) {
    const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
    if (!routine || !homeUnit) {
      pool.trip[slot] = NO_TRIP;
      pool.dueStep[slot] = NOTHING_DUE;
      return;
    }
    const home = unitPlace(homeUnit);
    advance({ context, state, treks, slot, routine, home, dayStart, routes });
  }
}

export interface ResidentRoutineSystems {
  planHook: ScheduledHook;
  system: SimulationSystem;
}

/** The daily 00:00 plan and the system that walks residents through it (people spec 7). */
export function createResidentRoutine(
  routes: RoutePlanner,
  options: { treks?: boolean } = {},
): ResidentRoutineSystems {
  const treks = options.treks ?? false;
  return {
    planHook: {
      name: 'resident-plans',
      schedule: { every: 'day', hour: 0, minute: 0 },
      run: drawPlans,
    },
    system: createPeopleSystem((context, slot) => runResident(context, slot, routes, treks)),
  };
}
