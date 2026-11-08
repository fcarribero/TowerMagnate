import {
  OFFICE_WORKER_ARRIVAL,
  OFFICE_WORKER_LEAVE,
  OFFICE_WORKER_LUNCH_DEPARTURE,
  type Level,
  type TowerState,
  type WindowPart,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  createOfficeRoutine,
  decodeRoutine,
  encodeRoutine,
  straightLineRoutes,
  type OfficeRoutine,
  type RoutePlanner,
} from './office-routine';
import { addPeopleForUnit, NOTHING_DUE } from './people';
import { hashState } from './hash';
import { cloneState } from './state';
import { createScheduler } from './scheduler';
import { createEngine, type Engine, type SimulationSystem } from './step';
import { buildTower } from './testing';
import { drawMinuteFromWindow } from './time-windows';
import { createRng } from './rng';
import { ledgerWeekRollHook } from './money';

const SEEDS = [1, 2, 3, 4, 5];

interface Sighting {
  personId: number;
  step: number;
  minuteOfDay: number;
  weekday: number;
  routine: OfficeRoutine;
}

interface OfficeTower {
  state: TowerState;
  officeIds: string[];
  fastFoodIds: string[];
}

function officeTower(options: { seed: number; offices: number; fastFoods?: number }): OfficeTower {
  const officesPerFloor = 8;
  const fastFoodColumns = [0, 30, 60];
  const fastFoods = options.fastFoods ?? 1;
  const topFloor = 3 + Math.ceil(options.offices / officesPerFloor);
  const units = [];
  for (let index = 0; index < fastFoods; index++) {
    units.push({ type: 'fast-food' as const, level: 2 as Level, x: fastFoodColumns[index] ?? 0 });
  }
  for (let index = 0; index < options.offices; index++) {
    units.push({
      type: 'office' as const,
      level: (3 + Math.floor(index / officesPerFloor)) as Level,
      x: (index % officesPerFloor) * 9,
    });
  }
  const { state, unitIds } = buildTower({
    seed: options.seed,
    lobby: { x0: 0, x1: 79 },
    floors: [{ from: 2, to: topFloor as Level, x0: 0, x1: 79 }],
    units,
  });
  return {
    state,
    fastFoodIds: unitIds.slice(0, fastFoods),
    officeIds: unitIds.slice(fastFoods),
  };
}

function populate(tower: OfficeTower): void {
  for (const officeId of tower.officeIds) addPeopleForUnit(tower.state, officeId);
}

/** Records who has something due at each step, before the routine handles it. */
function observer(sightings: Sighting[]): SimulationSystem {
  return ({ state }) => {
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (pool.dueStep[slot] !== state.step) continue;
      const routine = decodeRoutine(pool.trip[slot] ?? 0);
      if (!routine) continue;
      const stepOfDay = state.step % STEPS_PER_DAY;
      sightings.push({
        personId: pool.id[slot] ?? 0,
        step: state.step,
        minuteOfDay: Math.floor(stepOfDay / STEPS_PER_MINUTE),
        weekday: Math.floor(state.step / STEPS_PER_DAY) % 7,
        routine,
      });
    }
  };
}

function engineWith(routes: RoutePlanner, sightings: Sighting[]): Engine {
  const routine = createOfficeRoutine(routes);
  return createEngine({
    commandHandlers: {},
    systems: [
      createScheduler([ledgerWeekRollHook, routine.planHook]),
      observer(sightings),
      routine.system,
    ],
  });
}

function runSteps(state: TowerState, steps: number, routes: RoutePlanner = straightLineRoutes) {
  const sightings: Sighting[] = [];
  const result = engineWith(routes, sightings).step(state, [], steps);
  return { state: result.state, sightings };
}

function only(sightings: Sighting[], phase: OfficeRoutine['phase']): Sighting[] {
  return sightings.filter((sighting) => sighting.routine.phase === phase);
}

function share(count: number, total: number): number {
  return count / total;
}

function partCounts(minutes: number[], parts: readonly WindowPart[]): number[] {
  return parts.map(
    (part) => minutes.filter((minute) => minute >= part.from && minute < part.to).length,
  );
}

function expectWindowShares(minutes: number[], parts: readonly WindowPart[]): void {
  const counts = partCounts(minutes, parts);
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(minutes.length);
  parts.forEach((part, index) => {
    const expected = (minutes.length * part.weight) / 100;
    const observed = counts[index] ?? 0;
    expect(Math.abs(share(observed, minutes.length) - part.weight / 100)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(observed - expected)).toBeLessThanOrEqual(expected * 0.05);
  });
}

describe('drawing a minute from a window', () => {
  it('draws whole minutes inside the window', () => {
    const rng = createRng(3);
    for (let draw = 0; draw < 500; draw++) {
      const minute = drawMinuteFromWindow(rng, OFFICE_WORKER_ARRIVAL);
      expect(Number.isInteger(minute)).toBe(true);
      expect(minute).toBeGreaterThanOrEqual(7 * 60 + 30);
      expect(minute).toBeLessThan(9 * 60 + 30);
    }
  });
});

describe('the routine in the trip number', () => {
  it('survives packing and unpacking', () => {
    const routine: OfficeRoutine = {
      phase: 'atLunch',
      lunchHandled: true,
      entranceOnRight: true,
      venue: 912,
      lunchMinute: 775,
      leaveMinute: 1139,
    };
    expect(decodeRoutine(encodeRoutine(routine))).toEqual(routine);
  });

  it('is never zero, which means no routine', () => {
    const routine: OfficeRoutine = {
      phase: 'waitingToArrive',
      lunchHandled: false,
      entranceOnRight: false,
      venue: 0,
      lunchMinute: 0,
      leaveMinute: 0,
    };
    expect(encodeRoutine(routine)).toBeGreaterThan(0);
    expect(decodeRoutine(0)).toBeNull();
  });
});

describe('two weeks of 300 office workers', () => {
  const arrivals: number[] = [];
  const lunchDepartures: number[] = [];
  const leaves: number[] = [];
  let weekdayWorkerDays = 0;
  let lunches = 0;
  let weekendSightings = 0;
  let tooFarLunch = 0;

  for (const seed of SEEDS) {
    const tower = officeTower({ seed, offices: 50 });
    populate(tower);
    const { sightings } = runSteps(tower.state, 15 * STEPS_PER_DAY);
    for (const sighting of only(sightings, 'waitingToArrive')) {
      arrivals.push(sighting.minuteOfDay);
      weekdayWorkerDays += 1;
    }
    for (const sighting of only(sightings, 'toLunch')) {
      if (!tower.fastFoodIds.includes(`u${sighting.routine.venue}`)) tooFarLunch += 1;
    }
    lunches += only(sightings, 'atLunch').length;
    for (const sighting of only(sightings, 'atOffice')) {
      if (!sighting.routine.lunchHandled) lunchDepartures.push(sighting.minuteOfDay);
    }
    for (const sighting of sightings) {
      if (sighting.weekday >= 5) weekendSightings += 1;
      const isLeaveStart =
        sighting.routine.phase === 'atOffice' &&
        sighting.routine.lunchHandled &&
        sighting.minuteOfDay >= 17 * 60;
      if (isLeaveStart) leaves.push(sighting.minuteOfDay);
    }
  }

  it('has 300 workers a seed over ten weekdays, the first of them a Tuesday', () => {
    expect(weekdayWorkerDays).toBe(SEEDS.length * 300 * 10);
  });

  it('draws arrival times from the weighted window', () => {
    expect(arrivals.length).toBe(weekdayWorkerDays);
    expectWindowShares(arrivals, OFFICE_WORKER_ARRIVAL);
  });

  it('sends 80% of the workers to lunch', () => {
    expect(Math.abs(share(lunches, weekdayWorkerDays) - 0.8)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(lunches - weekdayWorkerDays * 0.8)).toBeLessThanOrEqual(
      weekdayWorkerDays * 0.8 * 0.05,
    );
  });

  it('draws lunch departures from the weighted window', () => {
    expect(lunchDepartures.length).toBe(weekdayWorkerDays);
    expectWindowShares(lunchDepartures, OFFICE_WORKER_LUNCH_DEPARTURE);
  });

  it('draws leave times from the weighted window', () => {
    expect(leaves.length).toBe(weekdayWorkerDays);
    expectWindowShares(leaves, OFFICE_WORKER_LEAVE);
  });

  it('never moves a worker on Saturday or Sunday', () => {
    expect(weekendSightings).toBe(0);
  });

  it('sends lunch to a fast food', () => {
    expect(lunches).toBeGreaterThan(0);
    expect(tooFarLunch).toBe(0);
  });
});

describe('skip rules', () => {
  function oneOfficeDay(planner: RoutePlanner, options: { fastFoods?: number } = {}) {
    const tower = officeTower({ seed: 11, offices: 2, ...options });
    populate(tower);
    const run = runSteps(tower.state, 2 * STEPS_PER_DAY - 1, planner);
    return { ...tower, ...run, workers: 12 };
  }

  const longWalkToOffice =
    (steps: number): RoutePlanner =>
    (state, from, to) =>
      from.level === 1 && to.level > 2 ? steps : straightLineRoutes(state, from, to);

  it('skips lunch when the worker is not at the office yet', () => {
    const { sightings, state } = oneOfficeDay(longWalkToOffice(6 * 360));
    expect(only(sightings, 'toLunch')).toHaveLength(0);
    expect(only(sightings, 'atLunch')).toHaveLength(0);
    expect(only(sightings, 'walkingIn').length).toBeGreaterThan(0);
    expect(state.people.dueStep.every((due) => due === NOTHING_DUE)).toBe(true);
  });

  it('gives up the arrival when the leave time passes first', () => {
    const { sightings, workers, state } = oneOfficeDay(longWalkToOffice(14 * 360));
    expect(only(sightings, 'givingUpArrival')).toHaveLength(workers);
    expect(only(sightings, 'walkingIn')).toHaveLength(0);
    expect(only(sightings, 'atOffice')).toHaveLength(0);
    expect(state.people.dueStep.every((due) => due === NOTHING_DUE)).toBe(true);
  });

  it('retries a worker with no route and gives up once the leave time is near', () => {
    const { sightings, workers } = oneOfficeDay(() => null);
    const firstDay = sightings.filter((sighting) => sighting.step < STEPS_PER_DAY * 2);
    expect(only(firstDay, 'waitingToArrive').length).toBeGreaterThan(workers);
    expect(only(firstDay, 'givingUpArrival').length).toBeGreaterThan(0);
    expect(only(firstDay, 'atOffice')).toHaveLength(0);
  });

  it('keeps the worker at the office when lunch finds no fast food', () => {
    const { sightings, workers, state } = oneOfficeDay(straightLineRoutes, { fastFoods: 0 });
    expect(only(sightings, 'toLunch')).toHaveLength(0);
    expect(only(sightings, 'leaving')).toHaveLength(workers);
    expect(state.people.dueStep.every((due) => due === NOTHING_DUE)).toBe(true);
  });

  it('keeps the worker at the office when no fast food is reachable', () => {
    const planner: RoutePlanner = (state, from, to) =>
      to.level === 2 ? null : straightLineRoutes(state, from, to);
    const { sightings, workers } = oneOfficeDay(planner);
    expect(only(sightings, 'toLunch')).toHaveLength(0);
    expect(only(sightings, 'leaving')).toHaveLength(workers);
  });

  it('picks a reachable fast food over one with no route', () => {
    const tower = officeTower({ seed: 12, offices: 4, fastFoods: 2 });
    populate(tower);
    const [unreachable, reachable] = tower.fastFoodIds;
    const unreachableColumn = tower.state.units[unreachable ?? '']?.x ?? -1;
    const planner: RoutePlanner = (state, from, to) =>
      to.level === 2 && to.column <= unreachableColumn + 8
        ? null
        : straightLineRoutes(state, from, to);
    const { sightings } = runSteps(tower.state, 2 * STEPS_PER_DAY - 1, planner);
    const lunches = only(sightings, 'toLunch');
    expect(lunches.length).toBeGreaterThan(0);
    for (const lunch of lunches) expect(`u${lunch.routine.venue}`).toBe(reachable);
  });

  it('brings a worker back from lunch and leaves at once when the leave time has passed', () => {
    const slowToFastFood: RoutePlanner = (state, from, to) =>
      from.level > 2 && to.level === 2 ? 7 * 360 : straightLineRoutes(state, from, to);
    const { sightings } = oneOfficeDay(slowToFastFood);
    const returns = only(sightings, 'backFromLunch');
    const exits = only(sightings, 'leaving');
    const longestWalkOut = 79 + 6 * 10;
    expect(returns.length).toBeGreaterThan(0);
    for (const back of returns) {
      const exit = exits.find((candidate) => candidate.personId === back.personId);
      expect(exit).toBeDefined();
      expect((exit?.step ?? 0) - back.step).toBeLessThanOrEqual(longestWalkOut);
    }
  });
});

describe('workers who arrive during the week', () => {
  it('start on the next weekday', () => {
    const tower = officeTower({ seed: 21, offices: 1 });
    const stepsToFridayNoon = (4 * 24 + 12) * 360;
    const engine = engineWith(straightLineRoutes, []);
    const beforeTenant = engine.step(tower.state, [], stepsToFridayNoon).state;
    const [officeId] = tower.officeIds;
    addPeopleForUnit(beforeTenant, officeId ?? '');
    const sightings: Sighting[] = [];
    const weekend = engineWith(straightLineRoutes, sightings).step(
      beforeTenant,
      [],
      STEPS_PER_DAY * 3.5,
    );
    const monday = sightings.filter((sighting) => sighting.weekday === 0);
    expect(sightings.filter((sighting) => sighting.weekday !== 0)).toHaveLength(0);
    expect(only(monday, 'waitingToArrive')).toHaveLength(6);
    expect(weekend.state.people.id).toHaveLength(6);
  });

  it('start the next day when the tenant comes after the plans were drawn', () => {
    const tower = officeTower({ seed: 22, offices: 1 });
    const engine = engineWith(straightLineRoutes, []);
    const mondayMorning = engine.step(tower.state, [], STEPS_PER_DAY + 6 * 360).state;
    const [officeId] = tower.officeIds;
    addPeopleForUnit(mondayMorning, officeId ?? '');
    const sightings: Sighting[] = [];
    engineWith(straightLineRoutes, sightings).step(mondayMorning, [], STEPS_PER_DAY - 6 * 360);
    expect(sightings).toHaveLength(0);
  });
});

describe('copying the tower in the middle of the day', () => {
  it('continues with the same people, plans and state hash', () => {
    const tower = officeTower({ seed: 31, offices: 10 });
    populate(tower);
    const engine = engineWith(straightLineRoutes, []);
    const midLunch = engine.step(tower.state, [], 2 * STEPS_PER_DAY + 12.75 * 360).state;
    const restored = cloneState(midLunch);
    const original = engine.step(midLunch, [], 2 * STEPS_PER_DAY);
    const afterRestore = engine.step(restored, [], 2 * STEPS_PER_DAY);
    expect(hashState(afterRestore.state)).toBe(hashState(original.state));
  });
});
