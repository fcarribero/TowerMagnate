import {
  CINEMA_SHOW_CAPS,
  PERSON_KINDS,
  UNIT_CATALOG,
  type TowerState,
  type UnitId,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { createCustomers } from './customers';
import { populationOf } from './population';
import { createScheduler } from './scheduler';
import { showEntryAt, showGuestCount } from './show-visitors';
import { createEngine, step } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { newUnit } from './units';

const TUESDAY = 1;
const AUDIENCE_KIND = PERSON_KINDS.indexOf('audience');
const PARTY_GUEST_KIND = PERSON_KINDS.indexOf('partyGuest');
const LOW_STRESS = 0;
const HIGH_STRESS = 90;
const VERY_HIGH_STRESS = 180;
const OLD_FILM_DAYS = 60;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

function stepOfDay(hour: number, minute = 0): number {
  return at(0, hour, minute);
}

describe('show guest count', () => {
  const noSubway = (cap: number, averageStress: number | null) =>
    showGuestCount({ cap, averageStress, subway: false });
  const withSubway = (cap: number, averageStress: number | null) =>
    showGuestCount({ cap, averageStress, subway: true });

  it('fills the cinema of a new film when stress is low, with or without a subway', () => {
    expect(noSubway(120, null)).toBe(120);
    expect(noSubway(120, LOW_STRESS)).toBe(120);
    expect(withSubway(120, LOW_STRESS)).toBe(120);
  });

  it('takes 0.8 for stress from 15 minutes and 0.6 from 30 minutes', () => {
    expect(noSubway(120, HIGH_STRESS)).toBe(96);
    expect(noSubway(120, VERY_HIGH_STRESS)).toBe(72);
    expect(withSubway(120, HIGH_STRESS)).toBe(115);
    expect(withSubway(120, VERY_HIGH_STRESS)).toBe(86);
  });

  it('keeps the party hall at 50 guests or fewer', () => {
    expect(noSubway(50, LOW_STRESS)).toBe(50);
    expect(withSubway(50, LOW_STRESS)).toBe(50);
    expect(noSubway(50, HIGH_STRESS)).toBe(40);
    expect(withSubway(50, HIGH_STRESS)).toBe(48);
    expect(noSubway(50, VERY_HIGH_STRESS)).toBe(30);
    expect(withSubway(50, VERY_HIGH_STRESS)).toBe(36);
  });

  it('never goes over the cap of any film age', () => {
    for (const { cap } of CINEMA_SHOW_CAPS) {
      for (const averageStress of [null, LOW_STRESS, HIGH_STRESS, VERY_HIGH_STRESS]) {
        expect(withSubway(cap, averageStress)).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe('entry to a show', () => {
  it('turns away a cinema visitor who comes more than an hour early', () => {
    expect(showEntryAt('cinema', stepOfDay(12, 59))).toEqual({ kind: 'turnAway' });
  });

  it('makes a cinema visitor wait for the start, then lets them in until 15 minutes after it', () => {
    expect(showEntryAt('cinema', stepOfDay(13))).toEqual({ kind: 'wait', until: stepOfDay(14) });
    expect(showEntryAt('cinema', stepOfDay(14))).toEqual({ kind: 'enter', endsAt: stepOfDay(16) });
    expect(showEntryAt('cinema', stepOfDay(14, 15))).toEqual({
      kind: 'enter',
      endsAt: stepOfDay(16),
    });
    expect(showEntryAt('cinema', stepOfDay(14, 15) + 6)).toEqual({ kind: 'turnAway' });
  });

  it('serves the evening show the same way', () => {
    expect(showEntryAt('cinema', stepOfDay(18, 30))).toEqual({
      kind: 'wait',
      until: stepOfDay(19),
    });
    expect(showEntryAt('cinema', stepOfDay(19, 10))).toEqual({
      kind: 'enter',
      endsAt: stepOfDay(21),
    });
    expect(showEntryAt('cinema', stepOfDay(19, 16))).toEqual({ kind: 'turnAway' });
    expect(showEntryAt('cinema', stepOfDay(16, 30))).toEqual({ kind: 'turnAway' });
  });

  it('lets party guests in from 13:00 until 15:00 and keeps them until 17:00', () => {
    expect(showEntryAt('party-hall', stepOfDay(11, 59))).toEqual({ kind: 'turnAway' });
    expect(showEntryAt('party-hall', stepOfDay(12, 10))).toEqual({
      kind: 'wait',
      until: stepOfDay(13),
    });
    expect(showEntryAt('party-hall', stepOfDay(14, 59))).toEqual({
      kind: 'enter',
      endsAt: stepOfDay(17),
    });
    expect(showEntryAt('party-hall', stepOfDay(15))).toEqual({ kind: 'turnAway' });
  });
});

interface ShowTower {
  state: TowerState;
  cinema: UnitId;
  partyHall: UnitId;
}

function showTower(): ShowTower {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 80),
    units: [
      { type: 'cinema', x: 40, level: 1 },
      { type: 'party-hall', x: 5, level: 1 },
    ],
  });
  return { state, cinema: unitIds[0] as UnitId, partyHall: unitIds[1] as UnitId };
}

function venueOf(state: TowerState, id: UnitId) {
  const venue = state.units[id]?.venue;
  if (!venue) throw new Error(`no venue counts on ${id}`);
  return venue;
}

function peopleOfKind(state: TowerState, kind: number): number {
  return state.people.kind.filter((personKind) => personKind === kind).length;
}

function stressYesterday(tower: ShowTower): void {
  for (const id of [tower.cinema, tower.partyHall]) {
    Object.assign(venueOf(tower.state, id), { stressSum: 200 * 10, stressTrips: 10 });
  }
}

const planOnly = createEngine({
  commandHandlers: {},
  systems: [createScheduler([createCustomers().planHook])],
});

function planDay(tower: TowerState, day: number): TowerState {
  const state = structuredClone(tower);
  state.step = at(day, 0) - 1;
  return planOnly.step(state, [], 1).state;
}

describe('the 00:00 plan of shows', () => {
  it('plans a full house for each cinema show and 50 party guests', () => {
    const { state, cinema, partyHall } = showTower();
    const planned = planDay(state, TUESDAY);
    expect(venueOf(planned, cinema).customers).toHaveLength(2 * 120);
    expect(venueOf(planned, partyHall).customers).toHaveLength(50);
  });

  it('draws cinema appearances from 13:00 to 14:00 and from 18:00 to 19:00', () => {
    const { state, cinema } = showTower();
    const steps = venueOf(planDay(state, TUESDAY), cinema).customers;
    for (const appears of steps) {
      const minute = (appears - at(TUESDAY, 0)) / STEPS_PER_MINUTE;
      const beforeFirstShow = minute >= 13 * 60 && minute < 14 * 60;
      const beforeSecondShow = minute >= 18 * 60 && minute < 19 * 60;
      expect(beforeFirstShow || beforeSecondShow).toBe(true);
    }
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('draws party guest appearances from 12:00 to 13:30', () => {
    const { state, partyHall } = showTower();
    for (const appears of venueOf(planDay(state, TUESDAY), partyHall).customers) {
      expect(appears).toBeGreaterThanOrEqual(at(TUESDAY, 12));
      expect(appears).toBeLessThan(at(TUESDAY, 13, 30));
    }
  });

  it('follows the age of the film', () => {
    const { state, cinema } = showTower();
    const film = venueOf(state, cinema);
    film.filmChangedAtStep = at(TUESDAY, 0) - 14 * STEPS_PER_DAY;
    expect(venueOf(planDay(state, TUESDAY), cinema).customers).toHaveLength(2 * 100);
    film.filmChangedAtStep = at(TUESDAY, 0) - OLD_FILM_DAYS * STEPS_PER_DAY;
    expect(venueOf(planDay(state, TUESDAY), cinema).customers).toHaveLength(2 * 35);
  });

  it('uses the stress of yesterday and the subway station', () => {
    const tower = showTower();
    stressYesterday(tower);
    const stressed = planDay(tower.state, TUESDAY);
    expect(venueOf(stressed, tower.cinema).customers).toHaveLength(2 * 72);
    expect(venueOf(stressed, tower.partyHall).customers).toHaveLength(30);

    tower.state.units.u99 = newUnit('u99', 'subway-station', 0, -9);
    const withStation = planDay(tower.state, TUESDAY);
    expect(venueOf(withStation, tower.cinema).customers).toHaveLength(2 * 86);
    expect(venueOf(withStation, tower.partyHall).customers).toHaveLength(36);
  });
});

function runFromMidnight(tower: TowerState, until: number) {
  let state = structuredClone(tower);
  state.step = at(TUESDAY, 0) - 1;
  state = step(state, [], 1).state;
  const history: { step: number; audience: number; guests: number }[] = [];
  while (state.step < until) {
    state = step(state, [], STEPS_PER_MINUTE).state;
    history.push({
      step: state.step,
      audience: peopleOfKind(state, AUDIENCE_KIND),
      guests: peopleOfKind(state, PARTY_GUEST_KIND),
    });
  }
  return { state, history };
}

describe('a day of shows in the tower', () => {
  it('counts every planned visitor and pays the full house', () => {
    const { state, cinema, partyHall } = showTower();
    const { state: end } = runFromMidnight(state, at(TUESDAY, 21, 1));
    expect(venueOf(end, cinema).yesterday).toEqual({ visits: 120, result: 15_000 });
    expect(venueOf(end, partyHall).yesterday).toEqual({ visits: 50, result: 10_000 });
  });

  it('keeps the audience and guests inside their caps and sends them home at the end', () => {
    const { state } = showTower();
    const { history } = runFromMidnight(state, at(TUESDAY, 21, 1));
    for (const { audience, guests } of history) {
      expect(audience).toBeLessThanOrEqual(120);
      expect(guests).toBeLessThanOrEqual(50);
    }
    const atMinute = (hour: number, minute: number) =>
      history.find((entry) => entry.step === at(TUESDAY, hour, minute));
    expect(atMinute(14, 30)?.audience).toBe(120);
    expect(atMinute(16, 30)?.audience).toBe(0);
    expect(atMinute(14, 30)?.guests).toBe(50);
    expect(atMinute(17, 30)?.guests).toBe(0);
    expect(atMinute(20, 0)?.audience).toBe(120);
  });

  it('pays less when yesterday stressed the visitors', () => {
    const tower = showTower();
    stressYesterday(tower);
    const { state: end } = runFromMidnight(tower.state, at(TUESDAY, 21, 1));
    expect(venueOf(end, tower.cinema).yesterday).toEqual({ visits: 72, result: 2_000 });
    expect(venueOf(end, tower.partyHall).yesterday).toEqual({ visits: 30, result: 5_000 });
  });

  it('sends nobody home late: no one is left at 03:00', () => {
    const { state } = showTower();
    const { state: end } = runFromMidnight(state, at(TUESDAY + 1, 3, 1));
    expect(peopleOfKind(end, AUDIENCE_KIND)).toBe(0);
    expect(peopleOfKind(end, PARTY_GUEST_KIND)).toBe(0);
  });

  it('turns away a cinema visitor who arrives after the entry time', () => {
    const { state, cinema } = showTower();
    state.step = at(TUESDAY, 14, 29);
    venueOf(state, cinema).customers = [at(TUESDAY, 14, 30)];
    const late = step(state, [], 20 * STEPS_PER_MINUTE).state;
    expect(venueOf(late, cinema).countToday).toBe(0);
    expect(peopleOfKind(late, AUDIENCE_KIND)).toBe(0);
  });

  it('turns away a party guest who arrives at 15:00', () => {
    const { state, partyHall } = showTower();
    state.step = at(TUESDAY, 14, 59);
    venueOf(state, partyHall).customers = [at(TUESDAY, 15)];
    const late = step(state, [], 20 * STEPS_PER_MINUTE).state;
    expect(venueOf(late, partyHall).countToday).toBe(0);
    expect(peopleOfKind(late, PARTY_GUEST_KIND)).toBe(0);
  });

  it('lets in a cinema visitor who walks in after the start, and sends them home at the end', () => {
    const { state, cinema } = showTower();
    state.step = at(TUESDAY, 14, 4);
    venueOf(state, cinema).customers = [at(TUESDAY, 14, 5)];
    const inside = step(state, [], 20 * STEPS_PER_MINUTE).state;
    expect(venueOf(inside, cinema).visits).toBe(1);
    expect(peopleOfKind(inside, AUDIENCE_KIND)).toBe(1);
    const gone = step(inside, [], 2 * STEPS_PER_HOUR).state;
    expect(peopleOfKind(gone, AUDIENCE_KIND)).toBe(0);
  });

  it('makes an early visitor wait and counts the visit at the start of the show', () => {
    const { state, cinema } = showTower();
    state.step = at(TUESDAY, 13, 29);
    venueOf(state, cinema).customers = [at(TUESDAY, 13, 30)];
    const waiting = step(state, [], 20 * STEPS_PER_MINUTE).state;
    expect(venueOf(waiting, cinema).countToday).toBe(0);
    expect(peopleOfKind(waiting, AUDIENCE_KIND)).toBe(1);
    const started = step(waiting, [], 15 * STEPS_PER_MINUTE).state;
    expect(venueOf(started, cinema).visits).toBe(1);
    expect(venueOf(started, cinema).countToday).toBe(1);
  });

  it('turns visitors away once the show holds its cap', () => {
    const { state, cinema } = showTower();
    state.step = at(TUESDAY, 13, 29);
    const film = venueOf(state, cinema);
    film.filmChangedAtStep = at(TUESDAY, 0) - OLD_FILM_DAYS * STEPS_PER_DAY;
    film.customers = Array.from({ length: 36 }, () => at(TUESDAY, 13, 30));
    const started = step(state, [], 40 * STEPS_PER_MINUTE).state;
    expect(venueOf(started, cinema).visits).toBe(35);
    expect(peopleOfKind(started, AUDIENCE_KIND)).toBe(35);
  });

  it('does not count in the population', () => {
    const { state } = showTower();
    const { state: during, history } = runFromMidnight(state, at(TUESDAY, 14, 30));
    expect(Math.max(...history.map((entry) => entry.audience + entry.guests))).toBeGreaterThan(0);
    expect(populationOf(during)).toEqual(populationOf(state));
    expect(UNIT_CATALOG.cinema.capacity?.people).toBe(120);
  });
});
