import {
  COURIER_CHANCE_PER_BLOCK,
  COURIER_HOURS_JITTER_MINUTES,
  COURIER_OFFICE_CLOSE_MINUTE,
  COURIER_OFFICE_OPEN_MINUTE,
  PERSON_KINDS,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { towerCommandHandlers } from './commands';
import {
  courierTripAt,
  createCouriers,
  isCourierSendingMinute,
  keyedHash,
  officeHours,
  officeWantsCourier,
} from './couriers';
import { moveInTenant } from './leases';
import { countPeopleOfUnit, countPeopleByKind, removePeopleOfUnit } from './people';
import { createScheduler } from './scheduler';
import { createEngine, type SimulationSystem } from './step';
import { addFlight, buildTower, plainTowerPlan } from './testing';
import { createTrekSystem } from './trek';

const COURIER_KIND = PERSON_KINDS.indexOf('courier');
/** The earliest and latest an office with its hours drifted by the jitter can send a courier. */
const FIRST_SENDING_STEP = 10.5 * STEPS_PER_HOUR;
const LAST_SENDING_STEP = 15.5 * STEPS_PER_HOUR;
const SATURDAY = 5 * STEPS_PER_DAY;

const couriers = createCouriers();

const leaseEverything: SimulationSystem = (context) => {
  for (const unit of Object.values(context.state.units)) {
    if (unit.type === 'office' && !unit.lease) {
      moveInTenant(context, unit.id);
    }
  }
};

const engine = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: [createScheduler(couriers.hooks), createTrekSystem(), couriers.system],
});

const leasingEngine = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: [leaseEverything, createScheduler(couriers.hooks), createTrekSystem(), couriers.system],
});

function officeTower(options: { reachable?: boolean; leased?: boolean } = {}) {
  const { reachable = true, leased = true } = options;
  const plan = {
    ...plainTowerPlan(4, 0, 99),
    units: [40, 52, 64, 76].flatMap((x) => [
      { type: 'office' as const, x, level: 2 },
      { type: 'office' as const, x, level: 3 },
    ]),
  };
  const built = buildTower(plan);
  if (reachable) {
    addFlight(built.state, 'stairs', 20, 1);
    addFlight(built.state, 'stairs', 20, 2);
    addFlight(built.state, 'stairs', 20, 3);
  }
  if (leased) {
    const first = leasingEngine.step(built.state, [], 1).state;
    return { ...built, state: first };
  }
  return built;
}

function courierCount(state: TowerState): number {
  return countPeopleByKind(state.people).courier ?? 0;
}

interface Watch {
  spawnSteps: number[];
  state: TowerState;
}

/** Steps one step at a time and notes every step at which the number of couriers grew. */
function watchDay(state: TowerState, steps: number): Watch {
  const spawnSteps: number[] = [];
  let current = state;
  let known = courierCount(current);
  for (let index = 0; index < steps; index++) {
    current = engine.step(current, [], 1).state;
    const now = courierCount(current);
    if (now > known) spawnSteps.push(current.step);
    known = now;
  }
  return { spawnSteps, state: current };
}

describe('courier sending rules', () => {
  it('sends only between two hours after opening and two hours before closing', () => {
    const hours = { open: 9 * 60, close: 17 * 60 };
    expect(isCourierSendingMinute(11 * 60 - 1, hours)).toBe(false);
    expect(isCourierSendingMinute(11 * 60, hours)).toBe(true);
    expect(isCourierSendingMinute(15 * 60 - 1, hours)).toBe(true);
    expect(isCourierSendingMinute(15 * 60, hours)).toBe(false);
  });

  it('opens and closes each office a little early or late, never at the exact hour for all', () => {
    const opens = new Set<number>();
    const closes = new Set<number>();
    for (let unit = 1; unit <= 200; unit++) {
      for (let day = 0; day < 5; day++) {
        const hours = officeHours(unit, day);
        expect(Math.abs(hours.open - COURIER_OFFICE_OPEN_MINUTE)).toBeLessThanOrEqual(
          COURIER_HOURS_JITTER_MINUTES,
        );
        expect(Math.abs(hours.close - COURIER_OFFICE_CLOSE_MINUTE)).toBeLessThanOrEqual(
          COURIER_HOURS_JITTER_MINUTES,
        );
        expect(officeHours(unit, day)).toEqual(hours);
        opens.add(hours.open);
        closes.add(hours.close);
      }
    }
    expect(opens.size).toBeGreaterThan(30);
    expect(closes.size).toBeGreaterThan(30);
  });

  it('decides from a pure hash of unit, day and block', () => {
    expect(officeWantsCourier(7, 3, 24)).toBe(officeWantsCourier(7, 3, 24));
    expect(keyedHash(1, 2, 3)).toBe(keyedHash(1, 2, 3));
    expect(keyedHash(1, 2, 3)).not.toBe(keyedHash(3, 2, 1));
  });

  it('wants a courier in about COURIER_CHANCE_PER_BLOCK of the blocks, a few per working day', () => {
    let wanted = 0;
    const blocks = 8;
    const trials = 2000;
    for (let unit = 1; unit <= trials; unit++) {
      for (let block = 22; block < 22 + blocks; block++) {
        if (officeWantsCourier(unit, 4, block)) wanted++;
      }
    }
    const rate = wanted / (trials * blocks);
    expect(rate).toBeGreaterThan(COURIER_CHANCE_PER_BLOCK - 0.03);
    expect(rate).toBeLessThan(COURIER_CHANCE_PER_BLOCK + 0.03);
    expect(rate * blocks).toBeGreaterThanOrEqual(2);
    expect(rate * blocks).toBeLessThanOrEqual(5);
  });
});

describe('courier spawn window', () => {
  it('never spawns in the first two hours after opening or the last two before closing', () => {
    let state = officeTower().state;
    const spawns: number[] = [];
    for (let day = 0; day < 5; day++) {
      const watched = watchDay(state, STEPS_PER_DAY);
      state = watched.state;
      spawns.push(...watched.spawnSteps);
    }
    expect(spawns.length).toBeGreaterThan(10);
    for (const step of spawns) {
      const stepOfDay = step % STEPS_PER_DAY;
      expect(stepOfDay).toBeGreaterThanOrEqual(FIRST_SENDING_STEP);
      expect(stepOfDay).toBeLessThanOrEqual(LAST_SENDING_STEP);
    }
  });

  it('sends nothing to an office with no tenant', () => {
    const { state } = officeTower({ leased: false });
    expect(watchDay(state, STEPS_PER_DAY).spawnSteps).toEqual([]);
  });

  it('sends nothing at the weekend', () => {
    const { state } = officeTower();
    const weekend = { ...state, step: SATURDAY };
    expect(watchDay(weekend, 2 * STEPS_PER_DAY).spawnSteps).toEqual([]);
  });

  it('is deterministic and leaves the random stream alone', () => {
    const start = officeTower().state;
    const first = watchDay(start, STEPS_PER_DAY);
    const second = watchDay(start, STEPS_PER_DAY);
    expect(first.spawnSteps.length).toBeGreaterThan(0);
    expect(second.spawnSteps).toEqual(first.spawnSteps);
    expect(first.state.rng).toEqual(start.rng);
  });
});

describe('courier trip', () => {
  it('walks in by the lobby end, waits at the office door, walks out and disappears', () => {
    let state = officeTower().state;
    state = { ...state, step: FIRST_SENDING_STEP - 1 };
    let followed: number | null = null;
    const phases: string[] = [];
    let atDoorColumn = -1;
    for (
      let index = 0;
      index < 2 * STEPS_PER_HOUR && !(followed !== null && courierCount(state) === 0);
      index++
    ) {
      state = engine.step(state, [], 1).state;
      const pool = state.people;
      if (followed === null) {
        const slot = pool.kind.indexOf(COURIER_KIND);
        if (slot < 0) continue;
        followed = pool.id[slot] as number;
        const column = pool.column[slot] as number;
        expect(Math.min(column, 99 - column)).toBeLessThanOrEqual(3);
        expect(pool.level[slot]).toBe(1);
      }
      const slot = pool.id.indexOf(followed);
      if (slot < 0) continue;
      const phase = courierTripAt(pool, slot)?.phase ?? 'none';
      if (phases[phases.length - 1] !== phase) phases.push(phase);
      if (phase === 'atDoor') atDoorColumn = pool.column[slot] as number;
    }
    expect(phases).toEqual(['toOffice', 'atDoor', 'leaving']);
    const unit = Object.values(state.units).find((candidate) => candidate.type === 'office');
    expect(unit).toBeDefined();
    expect(atDoorColumn).toBeGreaterThanOrEqual(40);
    expect(courierCount(state)).toBe(0);
    expect(state.people.id).not.toContain(followed);
  });

  it('is not counted as a person of the office', () => {
    let state = officeTower().state;
    state = { ...state, step: FIRST_SENDING_STEP - 1 };
    for (let index = 0; index < STEPS_PER_HOUR && courierCount(state) === 0; index++) {
      state = engine.step(state, [], 1).state;
    }
    const slot = state.people.kind.indexOf(COURIER_KIND);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(countPeopleOfUnit(state.people, `u${state.people.homeUnit[slot]}`)).toBe(0);
  });

  it('gives up when no route exists and leaves nobody behind over several days', () => {
    let state = officeTower({ reachable: false }).state;
    for (let day = 0; day < 4; day++) {
      state = engine.step(state, [], STEPS_PER_DAY).state;
      expect(courierCount(state)).toBe(0);
    }
  });

  it('leaves no courier in the pool at the end of any working day', () => {
    let state = officeTower().state;
    for (let day = 0; day < 7; day++) {
      state = engine.step(state, [], STEPS_PER_DAY).state;
      expect(courierCount(state)).toBe(0);
      expect(state.people.id.length).toBe(0);
    }
  });

  it('is removed with its office when the unit goes away', () => {
    let state = officeTower().state;
    state = { ...state, step: FIRST_SENDING_STEP - 1 };
    for (let index = 0; index < STEPS_PER_HOUR && courierCount(state) === 0; index++) {
      state = engine.step(state, [], 1).state;
    }
    const slot = state.people.kind.indexOf(COURIER_KIND);
    const home = `u${state.people.homeUnit[slot]}` as const;
    removePeopleOfUnit(state, home);
    expect(state.people.homeUnit.some((unit) => `u${unit}` === home)).toBe(false);
  });
});
