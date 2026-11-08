import {
  RECYCLING_PEOPLE_PER_CENTER,
  STAR_POPULATION_THRESHOLDS,
  SUITES_FOR_FOUR_STARS,
  UNIT_CATALOG,
  UNIT_TYPES,
  type StarRating,
  type StarRequirement,
  type TowerState,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { populationOf } from './population';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';

const STAR_CHECK_HOUR = 17;

/** Requirements of each step besides population, in the order their notices are shown. */
const REQUIREMENTS_BY_RATING: Readonly<Record<StarRating, readonly StarRequirement[]>> = {
  1: [],
  2: ['security'],
  3: ['vip', 'suites', 'recycling', 'medical', 'parking'],
  4: ['recycling', 'medical', 'parking', 'subway'],
  5: ['cathedral', 'wedding'],
  6: [],
};

const BLOCKED_NEWS: Readonly<Partial<Record<StarRequirement, string>>> = {
  security: 'news.starBlockedSecurity',
  vip: 'news.starBlockedVip',
  suites: 'news.starBlockedSuites',
  recycling: 'news.starBlockedRecycling',
  medical: 'news.starBlockedMedical',
  parking: 'news.starBlockedParking',
  subway: 'news.starBlockedSubway',
};

export interface RequirementStatus {
  requirement: StarRequirement;
  met: boolean;
}

function countUnits(state: TowerState, type: UnitType): number {
  return Object.values(state.units).filter((unit) => unit.type === type).length;
}

function isUsableSuite(unit: Unit): boolean {
  return unit.type === 'suite' && unit.hotel?.state !== 'infested';
}

function isWeekday(day: number): boolean {
  const weekday = weekdayOfDay(day);
  return weekday !== WEEKDAYS.saturday && weekday !== WEEKDAYS.sunday;
}

/** The previous weekday 17:00 for a check at `checkStep`: yesterday's, or Friday's on a Monday. */
function previousCheckStep(checkStep: number): number {
  const day = Math.floor(checkStep / STEPS_PER_DAY);
  const daysBack = weekdayOfDay(day) === WEEKDAYS.monday ? 3 : 1;
  return checkStep - daysBack * STEPS_PER_DAY;
}

/**
 * Where the window of the next check starts: the latest weekday 17:00 at or before `step`.
 * Before the first check of the game it is step 0.
 */
export function nextCheckWindowStart(step: number): number {
  let day = Math.floor(step / STEPS_PER_DAY);
  while (day >= 0) {
    const checkStep = day * STEPS_PER_DAY + STAR_CHECK_HOUR * STEPS_PER_HOUR;
    if (isWeekday(day) && checkStep <= step) {
      return checkStep;
    }
    day -= 1;
  }
  return 0;
}

/** The steps `start <= s < end` whose medical and parking failures block a check (stars.md 6). */
interface CheckWindow {
  start: number;
  end: number;
}

function failedIn(failureStep: number | null, window: CheckWindow): boolean {
  return failureStep !== null && failureStep >= window.start && failureStep < window.end;
}

function isMet(
  requirement: StarRequirement,
  state: TowerState,
  population: number,
  window: CheckWindow,
): boolean {
  switch (requirement) {
    case 'security':
      return countUnits(state, 'security') >= 1;
    case 'vip':
      return state.vipApproved;
    case 'suites':
      return Object.values(state.units).filter(isUsableSuite).length >= SUITES_FOR_FOUR_STARS;
    case 'recycling':
      return countUnits(state, 'recycling-center') * RECYCLING_PEOPLE_PER_CENTER >= population;
    case 'medical':
      return (
        countUnits(state, 'medical-center') >= 1 && !failedIn(state.lastMedicalFailureStep, window)
      );
    case 'parking':
      return !failedIn(state.lastParkingFailureStep, window);
    case 'subway':
      return countUnits(state, 'subway-station') >= 1;
    case 'cathedral':
      return countUnits(state, 'cathedral') >= 1;
    case 'wedding':
      return state.stars === 6;
  }
}

function statusOf(state: TowerState, population: number, window: CheckWindow): RequirementStatus[] {
  return REQUIREMENTS_BY_RATING[state.stars].map((requirement) => ({
    requirement,
    met: isMet(requirement, state, population, window),
  }));
}

/**
 * The next step's requirements besides population, as the next check would see them if it ran
 * now. Empty at Torre.
 */
export function nextStarRequirements(state: TowerState): RequirementStatus[] {
  const window = { start: nextCheckWindowStart(state.step), end: state.step + 1 };
  return statusOf(state, populationOf(state).total, window);
}

function unitsUnlockedAt(stars: StarRating): UnitType[] {
  return UNIT_TYPES.filter((type) => {
    const definition = UNIT_CATALOG[type];
    return 'unlockStars' in definition && definition.unlockStars === stars;
  });
}

/** The weekday star check of stars.md 4: one step up when everything is met, else alerts. */
export function runStarCheck(context: StepContext): void {
  const { state } = context;
  if (state.stars === 5 || state.stars === 6) {
    return;
  }
  const population = populationOf(state).total;
  if (population < STAR_POPULATION_THRESHOLDS[state.stars]) {
    return;
  }
  const window = { start: previousCheckStep(state.step), end: state.step };
  const missing = statusOf(state, population, window)
    .filter((status) => !status.met)
    .map((status) => status.requirement);
  if (missing.length === 0) {
    promote(context);
    return;
  }
  for (const requirement of missing) {
    const key = BLOCKED_NEWS[requirement];
    if (key !== undefined) {
      context.events.push({ type: 'news', step: state.step, key, unitId: null });
    }
  }
}

function promote(context: StepContext): void {
  const { state } = context;
  state.stars = (state.stars + 1) as StarRating;
  context.events.push({
    type: 'starsChanged',
    step: state.step,
    stars: state.stars,
    unlocked: unitsUnlockedAt(state.stars),
  });
  context.events.push({ type: 'news', step: state.step, key: 'news.starsUp', n: state.stars });
}

export const starCheckHook: ScheduledHook = {
  name: 'star-check',
  schedule: { every: 'weekday', hour: STAR_CHECK_HOUR, minute: 0 },
  run: runStarCheck,
};
