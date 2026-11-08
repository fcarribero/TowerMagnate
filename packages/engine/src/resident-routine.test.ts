import {
  RESIDENT_LEAVE,
  RESIDENT_RETURN,
  RESIDENT_WEEKDAY_SHOPPING,
  RESIDENT_WEEKEND_AFTERNOON,
  RESIDENT_WEEKEND_MORNING,
  VENUE_VISIT_MINUTES,
  type Level,
  type TowerState,
  type UnitType,
  type VisitedVenueType,
  type WindowPart,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { ledgerWeekRollHook } from './money';
import { straightLineRoutes, type RoutePlanner } from './office-routine';
import { addPeopleForUnit, NO_TRIP, NOTHING_DUE } from './people';
import {
  createResidentRoutine,
  decodeResidentRoutine,
  encodeResidentRoutine,
  type ResidentRoutine,
} from './resident-routine';
import { createScheduler } from './scheduler';
import { createEngine, type SimulationSystem } from './step';
import { buildTower } from './testing';

const SEEDS = [1, 2, 3, 4, 5];
const CONDOS = 100;
const CONDOS_PER_FLOOR = 5;
const SPAN_DAYS = 28;

interface Sighting {
  personId: number;
  weekday: number;
  minuteOfDay: number;
  routine: ResidentRoutine;
}

interface Visit {
  personId: number;
  weekday: number;
  type: VisitedVenueType;
  minutes: number;
}

interface Recorder {
  sightings: Sighting[];
  visits: Visit[];
  before: SimulationSystem;
  after: SimulationSystem;
}

function recorder(): Recorder {
  const sightings: Sighting[] = [];
  const visits: Visit[] = [];
  let due: { slot: number; weekday: number }[] = [];
  return {
    sightings,
    visits,
    before: ({ state }) => {
      due = [];
      const pool = state.people;
      const weekday = Math.floor(state.step / STEPS_PER_DAY) % 7;
      for (let slot = 0; slot < pool.id.length; slot++) {
        if (pool.dueStep[slot] !== state.step) continue;
        const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
        if (!routine) continue;
        due.push({ slot, weekday });
        sightings.push({
          personId: pool.id[slot] ?? 0,
          weekday,
          minuteOfDay: Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_MINUTE),
          routine,
        });
      }
    },
    after: ({ state }) => {
      const pool = state.people;
      for (const { slot, weekday } of due) {
        const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
        if (routine?.phase !== 'atVenue') continue;
        const type = state.units[`u${routine.venue}`]?.type as VisitedVenueType;
        visits.push({
          personId: pool.id[slot] ?? 0,
          weekday,
          type,
          minutes: ((pool.dueStep[slot] ?? 0) - state.step) / STEPS_PER_MINUTE,
        });
      }
    },
  };
}

interface CondoTower {
  state: TowerState;
  condoIds: string[];
}

const VENUE_LAYOUT: { type: VisitedVenueType; level: Level; x: number }[] = [
  { type: 'fast-food', level: 2, x: 0 },
  { type: 'restaurant', level: 2, x: 32 },
  { type: 'retail-shop', level: 2, x: 56 },
  { type: 'fast-food', level: 2, x: 16 },
  { type: 'retail-shop', level: 3, x: 0 },
  { type: 'retail-shop', level: 3, x: 12 },
];

function condoTower(seed: number, condos: number): CondoTower {
  const units: { type: UnitType; level: Level; x: number }[] = [...VENUE_LAYOUT];
  for (let index = 0; index < condos; index++) {
    units.push({
      type: 'condo',
      level: (4 + Math.floor(index / CONDOS_PER_FLOOR)) as Level,
      x: (index % CONDOS_PER_FLOOR) * 16,
    });
  }
  const top = 4 + Math.ceil(condos / CONDOS_PER_FLOOR);
  const { state, unitIds } = buildTower({
    seed,
    lobby: { x0: 0, x1: 79 },
    floors: [{ from: 2, to: top as Level, x0: 0, x1: 79 }],
    units,
  });
  VENUE_LAYOUT.forEach((venue, index) => {
    const unit = state.units[unitIds[index] ?? ''];
    if (unit && venue.type === 'retail-shop') {
      unit.lease = { anchorStep: 0, nextDueStep: Number.MAX_SAFE_INTEGER };
    }
  });
  return {
    state,
    condoIds: unitIds.slice(VENUE_LAYOUT.length),
  };
}

function populate(tower: CondoTower): void {
  for (const condoId of tower.condoIds) addPeopleForUnit(tower.state, condoId);
}

function run(state: TowerState, steps: number, routes: RoutePlanner = straightLineRoutes) {
  const watch = recorder();
  const routine = createResidentRoutine(routes);
  const engine = createEngine({
    commandHandlers: {},
    systems: [
      createScheduler([ledgerWeekRollHook, routine.planHook]),
      watch.before,
      routine.system,
      watch.after,
    ],
  });
  const result = engine.step(state, [], steps);
  return { state: result.state, sightings: watch.sightings, visits: watch.visits };
}

function isWeekend(weekday: number): boolean {
  return weekday >= 5;
}

function expectShare(observed: number, total: number, expected: number): void {
  expect(Math.abs(observed / total - expected)).toBeLessThanOrEqual(0.03);
  expect(Math.abs(observed - total * expected)).toBeLessThanOrEqual(total * expected * 0.05);
}

function expectWindowShares(minutes: number[], parts: readonly WindowPart[]): void {
  for (const part of parts) {
    const inPart = minutes.filter((minute) => minute >= part.from && minute < part.to).length;
    expectShare(inPart, minutes.length, part.weight / 100);
  }
  const inside = parts.reduce(
    (sum, part) => sum + minutes.filter((m) => m >= part.from && m < part.to).length,
    0,
  );
  expect(inside).toBe(minutes.length);
}

describe('resident routine encoding', () => {
  const routine: ResidentRoutine = {
    plan: 'weekend',
    phase: 'fromVenue',
    venue: 99_999,
    slots: [1440, 1440, 1440],
  };

  it('round-trips the largest routine inside the safe integer range', () => {
    const packed = encodeResidentRoutine(routine);
    expect(Number.isSafeInteger(packed)).toBe(true);
    expect(decodeResidentRoutine(packed)).toEqual(routine);
  });

  it('gives no routine for the empty trip', () => {
    expect(decodeResidentRoutine(NO_TRIP)).toBeNull();
  });
});

describe('four weeks of residents', () => {
  const outs: Sighting[] = [];
  const returns: number[] = [];
  const leaves: number[] = [];
  const morning: number[] = [];
  const afternoon: number[] = [];
  const weekdayShopping: number[] = [];
  const visits: Visit[] = [];
  let weekdayResidentDays = 0;
  let weekendResidentDays = 0;
  let stayerDays = 0;
  let stayerShops = 0;
  let stayerDinners = 0;
  let workerDinners = 0;
  let skippedDinners = 0;
  const choices: VisitedVenueType[] = [];
  let weekendDinners = 0;
  let weekendMornings = 0;
  let weekendAfternoons = 0;
  let sightedWeekend = 0;

  for (const seed of SEEDS) {
    const tower = condoTower(seed, CONDOS);
    populate(tower);
    const result = run(tower.state, (SPAN_DAYS + 1) * STEPS_PER_DAY - 1);
    visits.push(...result.visits);
    weekdayResidentDays += 300 * 20;
    weekendResidentDays += 300 * 8;
    for (const { routine, minuteOfDay, weekday } of result.sightings) {
      const first = routine.slots.findIndex((slot) => slot - 1 === minuteOfDay);
      const home = routine.phase === 'home';
      if (home && routine.plan === 'works' && first === 0) {
        leaves.push(minuteOfDay);
        outs.push({ personId: 0, weekday, minuteOfDay, routine });
      }
      if (routine.phase === 'outside') {
        returns.push(minuteOfDay);
        if (routine.slots[2] !== 0 && routine.slots[2] - 1 < minuteOfDay) skippedDinners += 1;
      }
      if (routine.phase === 'toVenue' && tower.state.units[`u${routine.venue}`]) {
        choices.push(tower.state.units[`u${routine.venue}`]?.type as VisitedVenueType);
      }
      if (!home) continue;
      if (routine.plan === 'staysHome' && first === 0) {
        stayerShops += 1;
        weekdayShopping.push(minuteOfDay);
      }
      if (routine.plan === 'staysHome' && first === 2) stayerDinners += 1;
      if (routine.plan === 'works' && first === 2) workerDinners += 1;
      if (routine.plan === 'weekend') {
        sightedWeekend += 1;
        if (first === 0) {
          weekendMornings += 1;
          morning.push(minuteOfDay);
        }
        if (first === 1) {
          weekendAfternoons += 1;
          afternoon.push(minuteOfDay);
        }
        if (first === 2) weekendDinners += 1;
      }
    }
  }
  stayerDays = weekdayResidentDays - outs.length;

  it('has 300 residents in every seed', () => {
    expect(CONDOS * 3).toBe(300);
    expect(weekdayResidentDays).toBe(SEEDS.length * 300 * 20);
  });

  it('sends 70% of the residents out on weekdays', () => {
    expectShare(outs.length, weekdayResidentDays, 0.7);
  });

  it('draws leave times from the weighted window', () => {
    expectWindowShares(leaves, RESIDENT_LEAVE);
  });

  it('brings every resident who left back inside the return window', () => {
    expect(returns.length).toBe(outs.length);
    expectWindowShares(returns, RESIDENT_RETURN);
  });

  it('sends 60% of the stay-at-home residents shopping, in the weighted window', () => {
    expectShare(stayerShops, stayerDays, 0.6);
    expectWindowShares(weekdayShopping, RESIDENT_WEEKDAY_SHOPPING);
  });

  it('draws dinner for 15% of the weekday residents, skipping the ones still outside', () => {
    expect(skippedDinners).toBeGreaterThan(0);
    expectShare(stayerDinners + workerDinners + skippedDinners, weekdayResidentDays, 0.15);
  });

  it('gives weekend residents a 60% morning trip, 60% afternoon trip and 25% dinner', () => {
    expect(sightedWeekend).toBeGreaterThan(0);
    expectShare(weekendMornings, weekendResidentDays, 0.6);
    expectShare(weekendAfternoons, weekendResidentDays, 0.6);
    expectShare(weekendDinners, weekendResidentDays, 0.25);
    expectWindowShares(morning, RESIDENT_WEEKEND_MORNING);
    expectWindowShares(afternoon, RESIDENT_WEEKEND_AFTERNOON);
  });

  it('never sends a resident to work on a weekend', () => {
    expect(outs.filter((out) => isWeekend(out.weekday))).toHaveLength(0);
  });

  it('splits outings 60% retail and 40% fast food', () => {
    const outings = choices.filter((type) => type !== 'restaurant');
    const retail = outings.filter((type) => type === 'retail-shop').length;
    expectShare(retail, outings.length, 0.6);
  });

  it('keeps visits at exactly 45 minutes for retail and fast food and 60 for the restaurant', () => {
    expect(visits.length).toBeGreaterThan(0);
    for (const visit of visits) expect(visit.minutes).toBe(VENUE_VISIT_MINUTES[visit.type]);
    expect(visits.some((visit) => visit.type === 'restaurant')).toBe(true);
  });
});

describe('skip rules', () => {
  const MORNING_TRIP = 10 * 60 + 1;
  const AFTERNOON_TRIP = 10 * 60 + 31;
  const SATURDAY_START = 5 * STEPS_PER_DAY;

  function weekendResident(
    slots: [number, number, number],
    routes: RoutePlanner,
    tower = condoTower(21, 1),
  ) {
    addPeopleForUnit(tower.state, tower.condoIds[0] ?? '');
    const pool = tower.state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      pool.trip[slot] = encodeResidentRoutine({ plan: 'weekend', phase: 'home', venue: 0, slots });
      pool.dueStep[slot] = SATURDAY_START + (slots[0] - 1) * STEPS_PER_MINUTE;
    }
    tower.state.step = SATURDAY_START;
    const watch = recorder();
    const routine = createResidentRoutine(routes);
    const engine = createEngine({
      commandHandlers: {},
      systems: [watch.before, routine.system, watch.after],
    });
    const result = engine.step(tower.state, [], STEPS_PER_DAY - 1);
    const oneResident = (visit: Visit) => visit.personId === pool.id[0];
    return {
      ...result,
      visits: watch.visits.filter(oneResident),
      allVisits: watch.visits,
      sightings: watch.sightings,
    };
  }

  it('skips the afternoon trip when the morning trip has not finished', () => {
    const slowRoutes: RoutePlanner = () => 3 * 60 * STEPS_PER_MINUTE;
    const { visits } = weekendResident([MORNING_TRIP, AFTERNOON_TRIP, 0], slowRoutes);
    expect(visits).toHaveLength(1);
  });

  it('makes both trips when the first one is back in time', () => {
    const { visits } = weekendResident([MORNING_TRIP, 14 * 60 + 1, 0], straightLineRoutes);
    expect(visits).toHaveLength(2);
  });

  it('adds every visit to the day count of the venue it went to', () => {
    const { allVisits, state } = weekendResident(
      [MORNING_TRIP, 14 * 60 + 1, 0],
      straightLineRoutes,
    );
    const counted = Object.values(state.units).reduce(
      (sum, unit) => sum + (unit.venue?.countToday ?? 0),
      0,
    );
    expect(allVisits.length).toBeGreaterThan(0);
    expect(counted).toBe(allVisits.length);
  });

  it('skips a dinner that comes while the resident is still outside', () => {
    const tower = condoTower(22, 1);
    addPeopleForUnit(tower.state, tower.condoIds[0] ?? '');
    const pool = tower.state.people;
    const returnMinute = 20 * 60 + 31;
    const dinnerMinute = 20 * 60 + 1;
    for (let slot = 0; slot < pool.id.length; slot++) {
      pool.trip[slot] = encodeResidentRoutine({
        plan: 'works',
        phase: 'outside',
        venue: 0,
        slots: [0, returnMinute, dinnerMinute],
      });
      pool.dueStep[slot] = (returnMinute - 1) * STEPS_PER_MINUTE;
    }
    const { visits } = run(tower.state, STEPS_PER_DAY - 1);
    expect(visits).toHaveLength(0);
  });

  it('skips a trip when no venue of the type is open', () => {
    const tower = condoTower(23, 1);
    tower.state.units = Object.fromEntries(
      Object.entries(tower.state.units).filter(([, unit]) => unit.type === 'condo'),
    );
    const { visits, state } = weekendResident([MORNING_TRIP, 0, 0], straightLineRoutes, tower);
    expect(visits).toHaveLength(0);
    expect(state.people.dueStep.every((due) => due === NOTHING_DUE)).toBe(true);
  });
});

describe('plans', () => {
  it('gives a resident created during the day no routine until the next 00:00', () => {
    const tower = condoTower(31, 1);
    const routine = createResidentRoutine(straightLineRoutes);
    const engine = createEngine({
      commandHandlers: {},
      systems: [createScheduler([routine.planHook]), routine.system],
    });
    const early = engine.step(tower.state, [], STEPS_PER_DAY / 2).state;
    addPeopleForUnit(early, tower.condoIds[0] ?? '');
    expect(early.people.trip.every((trip) => trip === NO_TRIP)).toBe(true);
    const later = engine.step(early, [], STEPS_PER_DAY / 2 + 2).state;
    expect(later.people.trip.some((trip) => trip !== NO_TRIP)).toBe(true);
  });
});
