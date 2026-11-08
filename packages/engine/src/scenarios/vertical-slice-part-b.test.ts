import type { EngineEvent, TowerState, UnitId } from '@tower-magnate/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { isWeekendDay, STEPS_PER_HOUR, weekdayOfDay } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { moveInTenant } from '../leases';
import { populationOf } from '../population';
import { runStarCheck } from '../stars';
import type { StepContext } from '../step';
import {
  formatSliceDays,
  formatSliceEvents,
  runVerticalSlice,
  verticalSliceTower,
  type SliceRun,
} from '../testing/vertical-slice';

const LAST_STEP = 14 * STEPS_PER_DAY;
const MONDAY_FIVE_PM = 17 * STEPS_PER_HOUR;
const FRIDAY_CHECK = 40_680;
const THREAT_STEP = 115_560;
const DEADLINE_STEP = 115_920;
const EXPLODE_STEP = 117_000;
const RANSOM = 200_000;
const OFFICE_RENT = 10_000;
const RUN_TIMEOUT_MS = 120_000;

function dayOf(stepNumber: number): number {
  return Math.floor(stepNumber / STEPS_PER_DAY);
}

function isWeekdayFivePm(stepNumber: number): boolean {
  const weekday = !isWeekendDay(weekdayOfDay(dayOf(stepNumber)));
  return weekday && stepNumber % STEPS_PER_DAY === MONDAY_FIVE_PM;
}

function ofType<T extends EngineEvent['type']>(events: readonly EngineEvent[], type: T) {
  return events.filter((event): event is Extract<EngineEvent, { type: T }> => event.type === type);
}

/** The forced event as the scenario expects it, one entry per engine event. */
function eventStory(events: readonly EngineEvent[]): string[] {
  return events
    .filter((event) => event.step >= THREAT_STEP)
    .map((event) => {
      switch (event.type) {
        case 'decisionOpened':
          return `${event.step} decisionOpened ${event.kind} ${event.deadlineStep} ${event.options.join('/')}`;
        case 'decisionClosed':
          return `${event.step} decisionClosed ${event.choice}`;
        case 'disaster':
          return `${event.step} disaster ${event.kind}`;
        case 'news':
          return `${event.step} ${event.key}`;
        default:
          return `${event.step} ${event.type}`;
      }
    });
}

/** The slice tower at Monday 17:00 with the first `count` offices leased, before the check runs. */
function towerWithLeases(count: number): StepContext {
  const state: TowerState = { ...verticalSliceTower(), step: MONDAY_FIVE_PM };
  const context: StepContext = { state, events: [] };
  const offices = Object.values(state.units).filter((unit) => unit.type === 'office');
  for (const office of offices.slice(0, count)) moveInTenant(context, office.id as UnitId);
  context.events.length = 0;
  return context;
}

describe('scenario: vertical slice part B, stars, forced bomb and 14 days', () => {
  let run: SliceRun;

  beforeAll(() => {
    run = runVerticalSlice();
  }, RUN_TIMEOUT_MS);

  it('runs 14 days, steps 0 to 120,959', () => {
    expect(run.state.step).toBe(LAST_STEP);
    expect(run.days).toHaveLength(14);
  });

  it('reaches 2 stars at 17:00 of a weekday, no later than the Friday check', () => {
    const changes = ofType(run.events, 'starsChanged');
    expect(changes).toHaveLength(1);
    const [change] = changes;
    expect(change?.stars).toBe(2);
    expect(isWeekdayFivePm(change?.step ?? -1)).toBe(true);
    expect(change?.step).toBeLessThanOrEqual(FRIDAY_CHECK);
    const news = run.events.filter((event) => event.type === 'news' && event.step === change?.step);
    expect(news).toEqual([{ type: 'news', step: change?.step, key: 'news.starsUp', n: 2 }]);
  });

  it('keeps 2 stars to the end of day 14', () => {
    const promotionDay = dayOf(ofType(run.events, 'starsChanged')[0]?.step ?? 0);
    expect(run.days.slice(promotionDay).every((day) => day.stars === 2)).toBe(true);
    expect(run.state.stars).toBe(2);
  });

  it('needs population 300: 49 offices stay at 1 star, 50 reach 2', () => {
    const fortyNine = towerWithLeases(49);
    expect(populationOf(fortyNine.state).total).toBe(294);
    runStarCheck(fortyNine);
    expect(fortyNine.state.stars).toBe(1);
    expect(fortyNine.events).toEqual([]);

    const fifty = towerWithLeases(50);
    expect(populationOf(fifty.state).total).toBe(300);
    runStarCheck(fifty);
    expect(fifty.state.stars).toBe(2);
    expect(ofType(fifty.events, 'starsChanged').map((event) => event.stars)).toEqual([2]);
  });

  it('opens no bomb threat before the forced one on day 13', () => {
    const opened = ofType(run.events, 'decisionOpened');
    expect(opened.map((event) => event.step)).toEqual([THREAT_STEP]);
  });

  it('plays the forced bomb threat in the order of EV-41', () => {
    expect(eventStory(run.events)).toEqual([
      `${THREAT_STEP} decisionOpened bomb ${DEADLINE_STEP} pay/refuse`,
      `${THREAT_STEP} news.bombThreat`,
      `${DEADLINE_STEP} decisionClosed refuse`,
      `${DEADLINE_STEP} news.decisionDefault`,
      `${DEADLINE_STEP} news.bombSearch`,
      `${EXPLODE_STEP} disaster bomb`,
      `${EXPLODE_STEP} news.bombExploded`,
    ]);
  });

  it('asks a $200,000 ransom and explodes on the bomb level', () => {
    const [threat] = run.bombThreats;
    expect(run.bombThreats).toHaveLength(1);
    expect(threat?.ransom).toBe(RANSOM);
    const exploded = run.events.find(
      (event) => event.type === 'news' && event.key === 'news.bombExploded',
    );
    expect(exploded).toMatchObject({ level: threat?.bomb.level });
    expect(run.state.activeEvents).toEqual([]);
    const ruinedOffices = 90 - (run.days[13]?.leasedOffices ?? 90);
    expect(ruinedOffices).toBeGreaterThan(0);
  });

  it('charges the day 7 rent like the day 0 rent', () => {
    const signedOnMonday = run.days[0]?.rentIncome ?? 0;
    expect(signedOnMonday).toBeGreaterThan(0);
    expect(run.days[7]?.rentIncome).toBe(signedOnMonday);
    const weekRent = (from: number) =>
      run.days.slice(from, from + 7).reduce((sum, day) => sum + day.rentIncome, 0);
    expect(weekRent(7)).toBe(weekRent(0));
    expect(weekRent(0)).toBe(OFFICE_RENT * 90);
  });

  it(
    'gives the same summaries, events and state hash for the same seed',
    () => {
      const again = runVerticalSlice();
      expect(again.days).toEqual(run.days);
      expect(again.events).toEqual(run.events);
      expect(again.hash).toBe(run.hash);
    },
    RUN_TIMEOUT_MS,
  );

  it('prints the days with stars and the events with their steps', () => {
    const days = formatSliceDays(run.days).split('\n');
    expect(days).toHaveLength(15);
    expect(days[14]?.trim().endsWith('2')).toBe(true);
    const events = formatSliceEvents(run.events).split('\n');
    expect(events).toHaveLength(run.events.length);
    expect(events.at(-1)).toMatch(/117000 {2}news\.bombExploded on level \d+/);
  });
});
