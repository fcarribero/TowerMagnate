import {
  WEDDING_GUESTS,
  type EngineEvent,
  type StarRating,
  type TowerState,
} from '@tower-magnate/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { addPerson, countPeopleByKind, listPeople } from './people';
import { populationOf } from './population';
import { step } from './step';
import { buildTower, type PlannedShaft } from './testing';
import { GUEST_ON_THE_WAY } from './wedding';

const population = vi.hoisted(() => ({ total: null as number | null }));

vi.mock('./population', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./population')>();
  return {
    ...actual,
    populationOf: (state: TowerState) =>
      population.total === null
        ? actual.populationOf(state)
        : { offices: population.total, total: population.total },
  };
});

const FRIDAY = 4;
const SATURDAY = 5;
const SUNDAY = 6;
const CATHEDRAL_X = 170;

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

/** Route test tower C: an express to 90 and, when reachable, a standard shaft from 90 to 101. */
function cathedralTower(options: { reachable: boolean; stars?: StarRating }): TowerState {
  const shafts: PlannedShaft[] = [{ type: 'express', x: 60, bottom: 1, top: 90 }];
  if (options.reachable) shafts.push({ type: 'standard', x: 150, bottom: 90, top: 101 });
  const { state } = buildTower({
    lobby: { x0: 40, x1: 339 },
    floors: [
      { from: 2, to: 100, x0: 40, x1: 339 },
      { from: 101, to: 104, x0: 140, x1: 200 },
    ],
    units: [{ type: 'cathedral', level: 101, x: CATHEDRAL_X }],
    shafts,
  });
  state.stars = options.stars ?? 5;
  return state;
}

function cathedralId(state: TowerState): string {
  const cathedral = Object.values(state.units).find((unit) => unit.type === 'cathedral');
  if (!cathedral) throw new Error('The tower has no cathedral');
  return cathedral.id;
}

interface Run {
  state: TowerState;
  events: EngineEvent[];
}

/** Steps from where the state is until the step `target` has run. */
function runUntil(state: TowerState, target: number): Run {
  return step(state, [], target - state.step);
}

/** Runs the 00:00 step of `day`. */
function runMidnight(state: TowerState, day: number): Run {
  return runUntil({ ...state, step: day * STEPS_PER_DAY - 1 }, day * STEPS_PER_DAY);
}

function newsKeys(events: readonly EngineEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

function countOf(events: readonly EngineEvent[], type: EngineEvent['type']): number {
  return events.filter((event) => event.type === type).length;
}

function guestCount(state: TowerState): number {
  return countPeopleByKind(state.people).weddingGuest ?? 0;
}

beforeEach(() => {
  population.total = 15_000;
});

describe('wedding attempt at 00:00 (stars 7.1)', () => {
  it('starts on Saturday with 40 guests due between 08:00 and 10:30', () => {
    const { state } = runMidnight(cathedralTower({ reachable: true }), SATURDAY);
    expect(state.wedding).toMatchObject({ day: SATURDAY, inside: 0, outcome: 'pending' });
    const arrivals = state.wedding?.arrivals ?? [];
    expect(arrivals).toHaveLength(WEDDING_GUESTS);
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    expect(Math.min(...arrivals)).toBeGreaterThanOrEqual(at(SATURDAY, 8));
    expect(Math.max(...arrivals)).toBeLessThan(at(SATURDAY, 10, 30));
  });

  it('starts on Sunday as well', () => {
    expect(runMidnight(cathedralTower({ reachable: true }), SUNDAY).state.wedding).not.toBeNull();
  });

  it('needs 15,000 people: 14,999 makes no attempt', () => {
    population.total = 14_999;
    expect(runMidnight(cathedralTower({ reachable: true }), SATURDAY).state.wedding).toBeNull();
  });

  it('never starts on a weekday', () => {
    expect(runMidnight(cathedralTower({ reachable: true }), FRIDAY).state.wedding).toBeNull();
  });

  it('needs the cathedral and a rating of exactly 5', () => {
    const noCathedral = cathedralTower({ reachable: true });
    Reflect.deleteProperty(noCathedral.units, cathedralId(noCathedral));
    expect(runMidnight(noCathedral, SATURDAY).state.wedding).toBeNull();
    const four = cathedralTower({ reachable: true, stars: 4 });
    expect(runMidnight(four, SATURDAY).state.wedding).toBeNull();
    const torre = cathedralTower({ reachable: true, stars: 6 });
    expect(runMidnight(torre, SATURDAY).state.wedding).toBeNull();
  });
});

describe('wedding guests (people 15)', () => {
  it('appear at a street entrance, never the subway, and are not counted in population', () => {
    const start = runMidnight(cathedralTower({ reachable: true }), SATURDAY).state;
    population.total = null;
    const before = populationOf(start).total;
    const firstArrival = start.wedding?.arrivals[0] ?? 0;
    const { state } = runUntil(start, firstArrival);
    const guests = listPeople(state.people).filter((person) => person.kind === 'weddingGuest');
    expect(guests.length).toBeGreaterThan(0);
    for (const guest of guests) {
      expect(guest.homeUnit).toBe(cathedralId(state));
      expect(guest.level).toBe(1);
    }
    expect(populationOf(state).total).toBe(before);
  });
});

describe('wedding with a reachable cathedral', () => {
  it('reaches Torre once all 40 are inside, then every guest leaves at 15:00', () => {
    const saturday = runMidnight(cathedralTower({ reachable: true }), SATURDAY).state;
    const morning = runUntil(saturday, at(SATURDAY, 12, 30));
    expect(morning.state.stars).toBe(6);
    expect(morning.state.wedding).toMatchObject({ inside: WEDDING_GUESTS, outcome: 'completed' });
    expect(countOf(morning.events, 'weddingCompleted')).toBe(1);
    expect(morning.events.filter((event) => event.type === 'starsChanged')).toMatchObject([
      { stars: 6 },
    ]);
    expect(newsKeys(morning.events)).toEqual(['news.towerRank']);

    const afternoon = runUntil(morning.state, at(SATURDAY, 15));
    expect(guestCount(afternoon.state)).toBe(0);
    expect(afternoon.state.wedding).toBeNull();
    expect(runMidnight(afternoon.state, SUNDAY).state.wedding).toBeNull();
  });
});

describe('wedding with a broken route', () => {
  it('fails at 12:30, keeps 5 stars, and a Sunday attempt still happens', () => {
    const saturday = runMidnight(cathedralTower({ reachable: false }), SATURDAY).state;
    const beforeDeadline = runUntil(saturday, at(SATURDAY, 12, 29));
    expect(newsKeys(beforeDeadline.events)).toEqual([]);
    const deadline = runUntil(beforeDeadline.state, at(SATURDAY, 12, 30));
    expect(newsKeys(deadline.events)).toEqual(['news.weddingFailed']);
    expect(deadline.state.stars).toBe(5);
    expect(deadline.state.wedding?.outcome).toBe('failed');
    expect(guestCount(deadline.state)).toBe(WEDDING_GUESTS);

    const afternoon = runUntil(deadline.state, at(SATURDAY, 15));
    expect(guestCount(afternoon.state)).toBe(0);
    expect(newsKeys(afternoon.events)).toEqual([]);
    expect(runMidnight(afternoon.state, SUNDAY).state.wedding?.day).toBe(SUNDAY);
  });
});

/** An attempt with 39 guests inside and the 40th arriving at `arrivalStep`. */
function lastGuestArrivingAt(arrivalStep: number): TowerState {
  const state = runMidnight(cathedralTower({ reachable: true }), SATURDAY).state;
  const cathedral = state.units[cathedralId(state)];
  if (!state.wedding || !cathedral) throw new Error('The attempt did not start');
  state.wedding.arrivals = [];
  state.wedding.inside = WEDDING_GUESTS - 1;
  addPerson(state, {
    kind: 'weddingGuest',
    homeUnit: Number(cathedral.id.slice(1)),
    level: cathedral.level,
    column: cathedral.x,
  });
  const slot = state.people.id.length - 1;
  state.people.trip[slot] = GUEST_ON_THE_WAY;
  state.people.dueStep[slot] = arrivalStep;
  return state;
}

describe('the 12:30 deadline (stars 7.2, 7.3)', () => {
  it('gives Torre when the 40th guest enters at 12:29', () => {
    const { state, events } = runUntil(
      lastGuestArrivingAt(at(SATURDAY, 12, 29)),
      at(SATURDAY, 12, 30),
    );
    expect(state.stars).toBe(6);
    expect(newsKeys(events)).toEqual(['news.towerRank']);
    expect(countOf(events, 'weddingCompleted')).toBe(1);
  });

  it('fails with 39 inside at 12:30, even if the 40th enters at that step', () => {
    const { state, events } = runUntil(
      lastGuestArrivingAt(at(SATURDAY, 12, 30)),
      at(SATURDAY, 12, 31),
    );
    expect(state.stars).toBe(5);
    expect(newsKeys(events)).toEqual(['news.weddingFailed']);
    expect(countOf(events, 'weddingCompleted')).toBe(0);
  });
});

describe('demolishing the cathedral during the attempt', () => {
  it('fails the wedding at once and every guest leaves', () => {
    const saturday = runMidnight(cathedralTower({ reachable: true }), SATURDAY).state;
    const morning = runUntil(saturday, at(SATURDAY, 10, 30)).state;
    expect(guestCount(morning)).toBe(WEDDING_GUESTS);
    const demolish = {
      id: 'c1',
      command: { type: 'demolish', target: { kind: 'unit', id: cathedralId(morning) } },
    } as const;
    const { state, events, results } = step(morning, [demolish], 1);
    expect(results[0]?.ok).toBe(true);
    expect(newsKeys(events)).toEqual(['news.weddingFailed']);
    expect(guestCount(state)).toBe(0);
    expect(state.wedding).toBeNull();
    expect(state.stars).toBe(5);
  });
});
