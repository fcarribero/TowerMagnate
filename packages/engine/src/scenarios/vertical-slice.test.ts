import type { TowerState, Unit } from '@tower-magnate/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { isWeekendDay, STEPS_PER_MINUTE, weekdayOfDay } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { step } from '../step';
import {
  formatSliceDays,
  runVerticalSlice,
  verticalSliceTower,
  type SliceRun,
} from '../testing/vertical-slice';

const WEEK_STEPS = 60_480;
const MONDAY_FIVE_PM = 6_120;
const OFFICE_RENT = 10_000;
const RUN_TIMEOUT_MS = 60_000;
const PART_A_DAYS = 7;

function offices(state: TowerState): Unit[] {
  return Object.values(state.units).filter((unit) => unit.type === 'office');
}

function leases(state: TowerState) {
  return offices(state).flatMap((unit) => (unit.lease ? [{ unit, lease: unit.lease }] : []));
}

function dayOf(stepNumber: number): number {
  return Math.floor(stepNumber / STEPS_PER_DAY);
}

function minuteOfDay(stepNumber: number): number {
  return (stepNumber % STEPS_PER_DAY) / STEPS_PER_MINUTE;
}

function isWeekday(day: number): boolean {
  return !isWeekendDay(weekdayOfDay(day));
}

function nextWeekday(day: number): number {
  let next = day + 1;
  while (!isWeekday(next)) next += 1;
  return next;
}

function rentThisWeek(state: TowerState): number {
  return state.ledger.currentWeek.rent.income;
}

describe('scenario: vertical slice part A, tenants, commute and rent over 7 days', () => {
  let run: SliceRun;

  beforeAll(() => {
    run = runVerticalSlice(PART_A_DAYS);
  }, RUN_TIMEOUT_MS);

  it('starts from the stars 8.6 tower with stairs and no tenants', () => {
    const tower = verticalSliceTower();
    const shafts = Object.values(tower.shafts);
    expect(tower.step).toBe(0);
    expect(tower.money).toBe(2_000_000);
    expect(tower.grid.levels[1]?.structure[0]?.kind).toBe('lobby');
    expect(shafts.map(({ type, bottom, top }) => ({ type, bottom, top }))).toEqual([
      { type: 'standard', bottom: 1, top: 10 },
    ]);
    const flightLevels = Object.values(tower.transports).map((flight) => flight.level);
    expect(flightLevels.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.values(tower.transports).every((flight) => flight.type === 'stairs')).toBe(true);
    for (let level = 2; level <= 10; level++) {
      expect(offices(tower).filter((unit) => unit.level === level)).toHaveLength(10);
    }
    expect(offices(tower)).toHaveLength(90);
    expect(offices(tower).every((unit) => unit.priceLevel === 'normal')).toBe(true);
    expect(leases(tower)).toEqual([]);
    expect(tower.people.id).toEqual([]);
  });

  it('leases at least 50 offices through prospects by Monday 17:00', () => {
    const signed = leases(run.state);
    const byFivePm = signed.filter(({ lease }) => lease.anchorStep <= MONDAY_FIVE_PM);
    expect(byFivePm.length).toBeGreaterThanOrEqual(50);
    for (const { lease } of signed) {
      expect(isWeekday(dayOf(lease.anchorStep))).toBe(true);
      expect(minuteOfDay(lease.anchorStep)).toBeGreaterThanOrEqual(8 * 60);
    }
  });

  it('charges rent at move-in and puts the next payment one week later', () => {
    const signed = leases(run.state);
    for (const { lease } of signed) {
      expect(lease.nextDueStep).toBe(lease.anchorStep + WEEK_STEPS);
    }
    const weekRent = run.days.reduce((sum, day) => sum + day.rentIncome, 0);
    expect(weekRent).toBe(OFFICE_RENT * signed.length);
    expect(run.days.at(-1)?.rentIncome).toBe(0);
  });

  it('pays the second rent exactly 60,480 steps after move-in', () => {
    const anchors = leases(run.state).map(({ lease }) => lease.anchorStep);
    const firstAnchor = Math.min(...anchors);
    const dueTogether = anchors.filter((anchor) => anchor === firstAnchor).length;
    const dueStep = firstAnchor + WEEK_STEPS;
    const justBefore = step(run.state, [], dueStep - 1 - run.state.step).state;
    const atDue = step(justBefore, [], 1).state;
    expect(atDue.step).toBe(dueStep);
    expect(rentThisWeek(atDue) - rentThisWeek(justBefore)).toBe(OFFICE_RENT * dueTogether);
  });

  it('brings workers from the weekday after move-in, 07:30 to 09:30, home 17:00 to 19:00', () => {
    const moveInDay = new Map(
      leases(run.state).map(({ unit, lease }) => [unit.id, dayOf(lease.anchorStep)]),
    );
    const firstDay = new Map<string, number>();
    for (const departure of run.workerDepartures) {
      const day = dayOf(departure.step);
      const minute = minuteOfDay(departure.step);
      const unitId = `u${departure.homeUnit}`;
      expect(isWeekday(day)).toBe(true);
      if (departure.fromLobby) {
        expect(minute).toBeGreaterThanOrEqual(7 * 60 + 30);
        expect(minute).toBeLessThan(9 * 60 + 30);
      } else {
        expect(minute).toBeGreaterThanOrEqual(17 * 60);
        expect(minute).toBeLessThan(19 * 60);
      }
      firstDay.set(unitId, Math.min(firstDay.get(unitId) ?? Infinity, day));
    }
    expect(firstDay.size).toBe(moveInDay.size);
    for (const [unitId, day] of firstDay) {
      expect(day).toBe(nextWeekday(moveInDay.get(unitId) as number));
    }
  });

  it('records stair and elevator trips on every commuting weekday and none at the weekend', () => {
    const [monday, ...rest] = run.days;
    const commutingDays = rest.slice(0, 4);
    const weekend = rest.slice(4);
    expect(monday?.elevatorTrips).toBeGreaterThan(0);
    for (const day of commutingDays) {
      expect(day.stairTrips).toBeGreaterThan(0);
      expect(day.elevatorTrips).toBeGreaterThan(0);
    }
    for (const day of weekend) {
      expect(day.stairTrips + day.elevatorTrips).toBe(0);
    }
  });

  it('has nobody on the move at 03:00 and nobody stuck over 360 steps', () => {
    expect(run.movingAtThreeAm).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(run.longestStuckSteps).toBeLessThanOrEqual(360);
  });

  it(
    'gives the same summaries and state hash at step 60,480 for the same seed',
    () => {
      const again = runVerticalSlice(PART_A_DAYS);
      expect(again.state.step).toBe(WEEK_STEPS);
      expect(again.days).toEqual(run.days);
      expect(again.hash).toBe(run.hash);
    },
    RUN_TIMEOUT_MS,
  );

  it('prints one summary line per day', () => {
    const lines = formatSliceDays(run.days).split('\n');
    expect(lines[0]).toBe(
      'Day  Leased  Population  Stair trips  Elevator trips  Rent income  Stars',
    );
    expect(lines).toHaveLength(8);
    const monday = run.days[0];
    expect(lines[1]).toContain(`$${monday?.rentIncome.toLocaleString('en-US')}`);
    expect(lines[1]?.startsWith('Mon')).toBe(true);
  });
});
