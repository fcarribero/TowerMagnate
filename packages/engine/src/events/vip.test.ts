import {
  HOTEL_NIGHTLY_PRICE,
  type EngineEvent,
  type Level,
  type StarRating,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { guestRoutineAt, VIP_KIND } from '../hotel-guest-trip';
import { slotOfPerson } from '../people';
import { populationOf } from '../population';
import { createScheduler } from '../scheduler';
import { createEngine, step, type StepContext } from '../step';
import { addFlight, buildTower, plainTowerPlan } from '../testing';
import { eventsPhase } from './index';
import { endVipVisit, openVipVisit, openVipVisitNow, vipBookingHook, vipLeftTower } from './vip';

const TUESDAY = 1;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

interface VipTowerOptions {
  suites?: number;
  reachable?: boolean;
  stars?: StarRating;
}

/** Suites on level 2 from x 20, a restaurant at x 150, stairs at x 4 unless unreachable. */
function vipTower(options: VipTowerOptions = {}) {
  const suites = Array.from({ length: options.suites ?? 1 }, (_, index) => ({
    type: 'suite' as const,
    x: 20 + index * 10,
    level: 2 as Level,
  }));
  const { state, unitIds } = buildTower({
    seed: 3,
    ...plainTowerPlan(2, 0, 200),
    units: [...suites, { type: 'restaurant', x: 150, level: 2 }],
  });
  if (options.reachable !== false) addFlight(state, 'stairs', 4, 1);
  state.stars = options.stars ?? 3;
  return { state, suites: unitIds.slice(0, suites.length) as UnitId[] };
}

function context(state: TowerState): StepContext {
  return { state, events: [] };
}

function newsKeys(events: readonly EngineEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

const eventsOnly = createEngine({ commandHandlers: {}, systems: [eventsPhase] });
const bookingOnly = createEngine({
  commandHandlers: {},
  systems: [createScheduler([vipBookingHook])],
});

/** Runs the 00:00 events phase of `days` days from Tuesday, forgetting each visit it opens. */
function midnightRolls(stars: StarRating, days: number) {
  let { state } = vipTower({ stars });
  let visits = 0;
  for (let day = 0; day < days; day++) {
    state.vipVisit = null;
    state.step = at(TUESDAY + day, 0) - 1;
    const rngBefore = { ...state.rng };
    state = eventsOnly.step(state, [], 1).state;
    if (state.vipVisit !== null) visits += 1;
    if (stars !== 3) expect(state.rng).toEqual(rngBefore);
  }
  return visits;
}

function checkIns(events: readonly EngineEvent[]) {
  return events.flatMap((event) =>
    event.type === 'hotelCheckIn' ? [{ nights: event.nights, paid: event.paid }] : [],
  );
}

const ONE_SUITE_NIGHT = { nights: 1, paid: HOTEL_NIGHTLY_PRICE.suite.normal };

function vipSlot(state: TowerState): number {
  const personId = state.vipVisit?.personId;
  return personId == null ? -1 : slotOfPerson(state.people, personId);
}

describe('VIP roll', () => {
  it.each([1, 2, 4, 5, 6] as const)('never rolls at %i stars', (stars) => {
    expect(midnightRolls(stars, 50)).toBe(0);
  });

  it('opens about one visit every 9 days at 3 stars over 900 days', () => {
    const visits = midnightRolls(3, 900);
    expect(visits).toBeGreaterThanOrEqual(75);
    expect(visits).toBeLessThanOrEqual(125);
  });

  it('does not roll while a visit is in progress', () => {
    const { state } = vipTower();
    const visit = openVipVisit(state, TUESDAY + 1);
    state.step = at(TUESDAY + 1, 0) - 1;
    const rngBefore = { ...state.rng };
    const after = eventsOnly.step(state, [], 1).state;
    expect(after.rng).toEqual(rngBefore);
    expect(openVipVisit(after, TUESDAY + 1)).toBeNull();
    expect(visit?.startedAtStars).toBe(3);
  });

  it('books today when forced before 12:00 and tomorrow after', () => {
    const { state } = vipTower();
    state.step = at(TUESDAY, 11, 59);
    expect(openVipVisitNow(state)?.day).toBe(TUESDAY);
    state.vipVisit = null;
    state.step = at(TUESDAY, 12);
    expect(openVipVisitNow(state)?.day).toBe(TUESDAY + 1);
  });
});

describe('VIP booking at 12:00', () => {
  it('books the clean free suite with the lowest unit id', () => {
    const { state, suites } = vipTower({ suites: 3 });
    const [first, second] = suites as [UnitId, UnitId];
    const busy = state.units[first]?.hotel;
    if (busy) busy.arrivalStep = at(TUESDAY, 15);
    openVipVisit(state, TUESDAY);
    state.step = at(TUESDAY, 12) - 1;
    const { state: after, events } = bookingOnly.step(state, [], 1);
    expect(after.vipVisit?.unitId).toBe(second);
    const arrival = after.units[second]?.hotel?.arrivalStep ?? 0;
    expect(arrival).toBeGreaterThanOrEqual(at(TUESDAY, 17));
    expect(arrival).toBeLessThan(at(TUESDAY, 21));
    expect(newsKeys(events)).toEqual(['news.vipArrives']);
  });

  it('fails with no clean free suite and leaves the flag alone', () => {
    const { state, suites } = vipTower();
    const room = state.units[suites[0] as UnitId]?.hotel;
    if (room) room.state = 'dirty';
    state.vipApproved = true;
    openVipVisit(state, TUESDAY);
    state.step = at(TUESDAY, 12) - 1;
    const { state: after, events } = bookingOnly.step(state, [], 1);
    expect(after.vipVisit).toBeNull();
    expect(after.vipApproved).toBe(true);
    expect(newsKeys(events)).toEqual(['news.vipNoSuite']);
  });

  it('books before the hotel rolls of the same step', () => {
    const { state, suites } = vipTower();
    openVipVisit(state, TUESDAY);
    state.step = at(TUESDAY, 12) - 1;
    const after = step(state, [], 1).state;
    expect(after.vipVisit?.unitId).toBe(suites[0]);
  });
});

describe('VIP approval', () => {
  function visitWithStress(stress: number, startedAtStars: StarRating = 3) {
    const { state } = vipTower();
    const visit = openVipVisit(state, TUESDAY);
    if (!visit) throw new Error('no visit');
    visit.startedAtStars = startedAtStars;
    visit.unitId = 'u1';
    visit.personId = 99;
    state.tripLedger['99'] = [10, stress - 1, 20, stress + 1, 30, stress];
    return state;
  }

  it('approves at an average of 89 steps and sets the flag', () => {
    const state = visitWithStress(89);
    const run = context(state);
    vipLeftTower(run, 99, true);
    expect(state.vipVisit?.outcome).toBe('approved');
    expect(state.vipApproved).toBe(true);
    expect(newsKeys(run.events)).toEqual(['news.vipApproved']);
  });

  it('rejects at an average of 90 steps', () => {
    const state = visitWithStress(90);
    const run = context(state);
    vipLeftTower(run, 99, true);
    expect(state.vipVisit?.outcome).toBe('rejected');
    expect(state.vipApproved).toBe(false);
    expect(newsKeys(run.events)).toEqual(['news.vipRejected']);
  });

  it('rejects a calm VIP who did not leave through an entrance', () => {
    const state = visitWithStress(10);
    vipLeftTower(context(state), 99, false);
    expect(state.vipVisit?.outcome).toBe('rejected');
  });

  it('does not set the flag for a visit that started at another rating', () => {
    const state = visitWithStress(10, 4);
    vipLeftTower(context(state), 99, true);
    expect(state.vipVisit?.outcome).toBe('approved');
    expect(state.vipApproved).toBe(false);
  });

  it('never clears the flag on a rejection and judges a visit once', () => {
    const state = visitWithStress(200);
    state.vipApproved = true;
    const run = context(state);
    endVipVisit(run, false);
    endVipVisit(run, true);
    expect(state.vipVisit?.outcome).toBe('rejected');
    expect(state.vipApproved).toBe(true);
    expect(newsKeys(run.events)).toEqual(['news.vipRejected']);
  });
});

describe('VIP stay', () => {
  /** Opens a visit for Tuesday and runs the tower from just before its 12:00 booking. */
  function startVisit(options: VipTowerOptions = {}) {
    const tower = vipTower(options);
    openVipVisit(tower.state, TUESDAY);
    tower.state.step = at(TUESDAY, 12) - 1;
    return tower;
  }

  it('comes, pays one night, dines, leaves the next morning and approves the visit', () => {
    const { state: start, suites } = startVisit();
    const suite = suites[0] as UnitId;
    let state = step(start, [], at(TUESDAY, 17) - start.step).state;
    const phases = new Set<string>();
    let populationWhileIn = 0;
    const events: EngineEvent[] = [];
    while (state.step < at(TUESDAY + 1, 11)) {
      const result = step(state, [], STEPS_PER_MINUTE);
      state = result.state;
      events.push(...result.events);
      const slot = vipSlot(state);
      if (slot < 0) continue;
      expect(state.people.kind[slot]).toBe(VIP_KIND);
      const phase = guestRoutineAt(state.people, slot)?.phase;
      if (phase) phases.add(phase);
      if (state.units[suite]?.hotel?.stayEndStep != null) {
        populationWhileIn = populationOf(state).hotel;
      }
    }
    expect(phases).toContain('atVenue');
    expect(populationWhileIn).toBe(1);
    expect(state.vipApproved).toBe(true);
    expect(newsKeys(events)).toContain('news.vipApproved');
    expect(state.vipVisit).toBeNull();
    expect(checkIns(events)).toEqual([ONE_SUITE_NIGHT]);
    expect(state.parking.spaces).toEqual({});
  });

  it('rejects a VIP who cannot reach the suite by 23:00', () => {
    const { state: start, suites } = startVisit({ reachable: false });
    const { state, events } = step(start, [], at(TUESDAY, 23, 1) - start.step);
    expect(newsKeys(events)).toContain('news.vipRejected');
    expect(state.vipApproved).toBe(false);
    expect(state.vipVisit).toBeNull();
    expect(state.units[suites[0] as UnitId]?.hotel?.stayEndStep).toBeNull();
  });

  it('rejects the visit when the suite is demolished during the stay', () => {
    const { state: start, suites } = startVisit();
    const suite = suites[0] as UnitId;
    let state = step(start, [], at(TUESDAY, 22) - start.step).state;
    expect(state.units[suite]?.hotel?.stayEndStep).not.toBeNull();
    const demolish = { type: 'demolish', target: { kind: 'unit', id: suite } } as const;
    const result = step(state, [{ id: 'c1', command: demolish }], 1);
    state = result.state;
    expect(result.results[0]?.ok).toBe(true);
    expect(newsKeys(result.events)).toContain('news.vipRejected');
    expect(state.vipApproved).toBe(false);
    expect(state.vipVisit).toBeNull();
  });

  it('still pays the suite on a visit after approval and leaves the flag set', () => {
    const { state: start } = startVisit();
    start.vipApproved = true;
    const { state, events } = step(start, [], at(TUESDAY, 22) - start.step);
    expect(state.vipVisit?.personId).not.toBeNull();
    expect(checkIns(events)).toEqual([ONE_SUITE_NIGHT]);
    const after = step(state, [], at(TUESDAY + 1, 11) - state.step).state;
    expect(after.vipApproved).toBe(true);
  });

  it('never uses the subway, arriving or leaving, with a station in the tower', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state, unitIds } = buildTower({
        seed,
        lobby: { x0: 0, x1: 200 },
        floors: [
          { from: 2, to: 2 as Level, x0: 0, x1: 200 },
          { from: -9 as Level, to: -1 as Level, x0: 0, x1: 200 },
        ],
        units: [
          { type: 'suite', x: 20, level: 2 as Level },
          { type: 'restaurant', x: 150, level: 2 },
          { type: 'subway-station', x: 10, level: -9 as Level },
        ],
        shafts: [{ type: 'standard', x: 124, bottom: -7, top: 2 }],
      });
      expect(unitIds).toHaveLength(3);
      state.stars = 3;
      openVipVisit(state, TUESDAY);
      state.step = at(TUESDAY, 12) - 1;
      let current = state;
      let seen = false;
      while (current.step < at(TUESDAY + 1, 11)) {
        current = step(current, [], STEPS_PER_MINUTE).state;
        const slot = vipSlot(current);
        if (slot < 0) continue;
        seen = true;
        expect(current.people.level[slot]).toBeGreaterThanOrEqual(1);
      }
      expect(seen).toBe(true);
    }
  });

  it('stays on the street while other hotel guests in the same tower use the subway', () => {
    const rooms = Array.from({ length: 8 }, (_, index) => ({
      type: (index % 2 === 0 ? 'single-room' : 'double-room') as UnitType,
      x: 40 + index * 10,
      level: 2 as Level,
    }));
    let guestsBySubway = 0;
    let visitsSeen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = buildTower({
        seed,
        lobby: { x0: 0, x1: 200 },
        floors: [
          { from: 2, to: 2 as Level, x0: 0, x1: 200 },
          { from: -9 as Level, to: -1 as Level, x0: 0, x1: 200 },
        ],
        units: [
          { type: 'suite', x: 20, level: 2 as Level },
          ...rooms,
          { type: 'restaurant', x: 150, level: 2 },
          { type: 'subway-station', x: 10, level: -9 as Level },
        ],
        shafts: [{ type: 'standard', x: 124, bottom: -7, top: 2 }],
      });
      state.stars = 3;
      openVipVisit(state, TUESDAY);
      state.step = at(TUESDAY, 12) - 1;
      let current = state;
      let vipSeen = false;
      const subwayGuests = new Set<number>();
      while (current.step < at(TUESDAY + 1, 11)) {
        current = step(current, [], STEPS_PER_MINUTE).state;
        const vip = vipSlot(current);
        const pool = current.people;
        for (let slot = 0; slot < pool.id.length; slot++) {
          if (guestRoutineAt(pool, slot) === null) continue;
          if (slot === vip) {
            vipSeen = true;
            expect(pool.level[slot]).toBeGreaterThanOrEqual(1);
          } else if ((pool.level[slot] as number) < 0) {
            subwayGuests.add(pool.id[slot] as number);
          }
        }
      }
      if (vipSeen) visitsSeen += 1;
      guestsBySubway += subwayGuests.size;
    }
    expect(visitsSeen).toBeGreaterThanOrEqual(10);
    expect(guestsBySubway).toBeGreaterThan(0);
  });
});
