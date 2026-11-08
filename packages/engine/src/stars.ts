import {
  RECYCLING_PEOPLE_PER_CENTER,
  STAR_POPULATION_THRESHOLDS,
  SUITES_FOR_FOUR_STARS,
  UNIT_CATALOG,
  UNIT_TYPES,
  type StarRating,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { populationOf } from './population';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';

type Requirement = 'security' | 'vip' | 'suites' | 'recycling' | 'medical' | 'parking' | 'subway';

/** Requirements of each step besides population, in the order their notices are shown. */
const REQUIREMENTS_BY_RATING: Readonly<Record<number, readonly Requirement[]>> = {
  1: [],
  2: ['security'],
  3: ['vip', 'suites', 'recycling', 'medical', 'parking'],
  4: ['recycling', 'medical', 'parking', 'subway'],
};

const BLOCKED_NEWS: Readonly<Record<Requirement, string>> = {
  security: 'news.starBlockedSecurity',
  vip: 'news.starBlockedVip',
  suites: 'news.starBlockedSuites',
  recycling: 'news.starBlockedRecycling',
  medical: 'news.starBlockedMedical',
  parking: 'news.starBlockedParking',
  subway: 'news.starBlockedSubway',
};

function countUnits(state: TowerState, type: UnitType): number {
  return Object.values(state.units).filter((unit) => unit.type === type).length;
}

/** The previous weekday 17:00 for a check at `step`: yesterday's, or Friday's on a Monday. */
function previousCheckStep(step: number): number {
  const day = Math.floor(step / STEPS_PER_DAY);
  const daysBack = weekdayOfDay(day) === WEEKDAYS.monday ? 3 : 1;
  return step - daysBack * STEPS_PER_DAY;
}

function failedSince(failureStep: number | null, windowStart: number): boolean {
  return failureStep !== null && failureStep >= windowStart;
}

function isMet(requirement: Requirement, state: TowerState, population: number): boolean {
  const windowStart = previousCheckStep(state.step);
  switch (requirement) {
    case 'security':
      return countUnits(state, 'security') >= 1;
    case 'vip':
      return state.vipApproved;
    case 'suites':
      return countUnits(state, 'suite') >= SUITES_FOR_FOUR_STARS;
    case 'recycling':
      return countUnits(state, 'recycling-center') * RECYCLING_PEOPLE_PER_CENTER >= population;
    case 'medical':
      return (
        countUnits(state, 'medical-center') >= 1 &&
        !failedSince(state.lastMedicalFailureStep, windowStart)
      );
    case 'parking':
      return !failedSince(state.lastParkingFailureStep, windowStart);
    case 'subway':
      return countUnits(state, 'subway-station') >= 1;
  }
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
  const missing = (REQUIREMENTS_BY_RATING[state.stars] ?? []).filter(
    (requirement) => !isMet(requirement, state, population),
  );
  if (missing.length === 0) {
    promote(context);
    return;
  }
  for (const requirement of missing) {
    context.events.push({
      type: 'news',
      step: state.step,
      key: BLOCKED_NEWS[requirement],
      unitId: null,
    });
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
  context.events.push({ type: 'news', step: state.step, key: 'news.starsUp', unitId: null });
}

export const starCheckHook: ScheduledHook = {
  name: 'star-check',
  schedule: { every: 'weekday', hour: 17, minute: 0 },
  run: runStarCheck,
};
