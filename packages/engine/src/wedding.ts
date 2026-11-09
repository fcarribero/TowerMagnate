import {
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  STAR_POPULATION_THRESHOLDS,
  WEDDING_DEADLINE_MINUTE,
  WEDDING_GUEST_ARRIVAL,
  WEDDING_GUESTS,
  WEDDING_GUESTS_LEAVE_MINUTE,
  type TowerState,
  type Unit,
  type WeddingAttempt,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace, unitPlace } from './office-routine';
import {
  addPerson,
  createPeopleSystem,
  NOTHING_DUE,
  parseUnitNumber,
  removePeopleOfUnit,
} from './people';
import { populationOf } from './population';
import { chance } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { drawMinuteFromWindow } from './time-windows';
import { startTrek } from './trek';
import { addFailedSearch } from './trip-ledger';

const GUEST_KIND = PERSON_KINDS.indexOf('weddingGuest');

/** Where a wedding guest is, kept in the person's `trip` number. */
const GUEST_OUTSIDE = 1;
export const GUEST_ON_THE_WAY = 2;
const GUEST_INSIDE = 3;

const WEDDING_POPULATION = STAR_POPULATION_THRESHOLDS[5];

function findCathedral(state: TowerState): Unit | null {
  return Object.values(state.units).find((unit) => unit.type === 'cathedral') ?? null;
}

function stepOfMinute(day: number, minute: number): number {
  return day * STEPS_PER_DAY + minute * STEPS_PER_MINUTE;
}

function deadlineStep(wedding: WeddingAttempt): number {
  return stepOfMinute(wedding.day, WEDDING_DEADLINE_MINUTE);
}

function leaveStep(wedding: WeddingAttempt): number {
  return stepOfMinute(wedding.day, WEDDING_GUESTS_LEAVE_MINUTE);
}

function drawArrivals(state: TowerState, day: number): number[] {
  const arrivals: number[] = [];
  for (let guest = 0; guest < WEDDING_GUESTS; guest++) {
    arrivals.push(stepOfMinute(day, drawMinuteFromWindow(state.rng, WEDDING_GUEST_ARRIVAL)));
  }
  return arrivals.sort((a, b) => a - b);
}

/** Stars spec 7.1: at 00:00 on a weekend day, after the counts roll, an attempt may be due. */
export function startWeddingAttempt(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  if (!isWeekendDay(occurrence.weekday) || state.stars !== 5) return;
  const cathedral = findCathedral(state);
  if (!cathedral || populationOf(state).total < WEDDING_POPULATION) return;
  state.wedding = {
    day: occurrence.dayNumber,
    cathedral: cathedral.id,
    arrivals: drawArrivals(state, occurrence.dayNumber),
    inside: 0,
    outcome: 'pending',
  };
  state.lastWeddingDay = occurrence.dayNumber;
}

export const weddingAttemptHook: ScheduledHook = {
  name: 'wedding-attempt',
  schedule: { every: 'day', hour: 0, minute: 0 },
  run: startWeddingAttempt,
};

function fail(context: StepContext, wedding: WeddingAttempt): void {
  wedding.outcome = 'failed';
  context.events.push({
    type: 'news',
    step: context.state.step,
    key: 'news.weddingFailed',
    unitId: null,
  });
}

/** Stars spec 7.2: the 40th guest inside before 12:30 gives the Torre rank. */
function complete(context: StepContext, wedding: WeddingAttempt): void {
  const { state } = context;
  wedding.outcome = 'completed';
  state.stars = 6;
  context.events.push({ type: 'starsChanged', step: state.step, stars: 6, unlocked: [] });
  context.events.push({ type: 'weddingCompleted', step: state.step });
  context.events.push({ type: 'news', step: state.step, key: 'news.towerRank', unitId: null });
}

/** Every guest leaves the tower and the attempt is over. */
function endAttempt(state: TowerState, wedding: WeddingAttempt): void {
  removePeopleOfUnit(state, wedding.cathedral);
  state.wedding = null;
}

/** Guests appear at the street entrance; with no main lobby there is nowhere to appear. */
function admitGuests(state: TowerState, wedding: WeddingAttempt): void {
  const homeUnit = parseUnitNumber(wedding.cathedral) ?? 0;
  while (wedding.arrivals[0] === state.step) {
    wedding.arrivals.shift();
    const entrance = entrancePlace(state, chance(state.rng, 0.5));
    if (!entrance) continue;
    addPerson(state, { kind: 'weddingGuest', homeUnit, ...entrance });
    const newestSlot = state.people.id.length - 1;
    state.people.trip[newestSlot] = GUEST_OUTSIDE;
    state.people.dueStep[newestSlot] = state.step;
  }
}

/** Runs the attempt's clock: guests appear, the cathedral may go, 12:30 and 15:00 pass. */
function runAttempt(context: StepContext, wedding: WeddingAttempt): void {
  const { state } = context;
  if (!Object.hasOwn(state.units, wedding.cathedral)) {
    if (wedding.outcome === 'pending') fail(context, wedding);
    endAttempt(state, wedding);
    return;
  }
  if (state.step === leaveStep(wedding)) {
    endAttempt(state, wedding);
    return;
  }
  if (state.step === deadlineStep(wedding) && wedding.outcome === 'pending') {
    fail(context, wedding);
  }
  admitGuests(state, wedding);
}

/** The trip to the cathedral is required: with no route the guest tries again later. */
function setOff(context: StepContext, slot: number, wedding: WeddingAttempt): void {
  const { state } = context;
  const pool = state.people;
  const cathedral = state.units[wedding.cathedral] as Unit;
  pool.dueStep[slot] = NOTHING_DUE;
  if (startTrek(context, slot, unitPlace(cathedral))) {
    pool.trip[slot] = GUEST_ON_THE_WAY;
    return;
  }
  addFailedSearch(pool, slot);
  pool.dueStep[slot] = state.step + ROUTE_RETRY_STEPS;
}

function enterCathedral(context: StepContext, slot: number, wedding: WeddingAttempt): void {
  const pool = context.state.people;
  pool.trip[slot] = GUEST_INSIDE;
  pool.dueStep[slot] = NOTHING_DUE;
  wedding.inside += 1;
  const allInside = wedding.inside === WEDDING_GUESTS;
  if (allInside && wedding.outcome === 'pending' && context.state.step < deadlineStep(wedding)) {
    complete(context, wedding);
  }
}

const guestSystem = createPeopleSystem((context, slot) => {
  const wedding = context.state.wedding;
  const pool = context.state.people;
  if (!wedding || pool.kind[slot] !== GUEST_KIND) return;
  if (pool.trip[slot] === GUEST_OUTSIDE) setOff(context, slot, wedding);
  else if (pool.trip[slot] === GUEST_ON_THE_WAY) enterCathedral(context, slot, wedding);
  else pool.dueStep[slot] = NOTHING_DUE;
});

/**
 * The wedding of the day (people spec 15): guests appear, walk to the cathedral and leave at
 * 15:00. Does nothing on a day without an attempt.
 */
export const weddingSystem: SimulationSystem = (context) => {
  const wedding = context.state.wedding;
  if (!wedding) return;
  runAttempt(context, wedding);
  if (context.state.wedding) guestSystem(context);
};
