import { priceOfLevel, type PriceLevel, type TowerState, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { towerCommandHandlers } from './commands';
import { addPerson, countPeopleByKind, listPeople } from './people';
import { createProspectDemand } from './prospects';
import { createScheduler } from './scheduler';
import { createEngine } from './step';
import { addFlight, buildTower, plainTowerPlan } from './testing';
import { createTrekSystem } from './trek';
import { createLeaseSystem } from './leases';

const FIRST_ROLL = 8 * STEPS_PER_HOUR;
/** Offices and shops roll from 07:00, inside the lease window. */
const FIRST_LEASE_ROLL = 7 * STEPS_PER_HOUR;
const SATURDAY = 5 * STEPS_PER_DAY;

const demand = createProspectDemand();
const engine = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: [
    createScheduler(demand.rollHooks),
    createLeaseSystem(),
    createTrekSystem(),
    demand.system,
  ],
});

interface Options {
  unit: 'office' | 'condo' | 'retail-shop';
  priceLevel?: PriceLevel;
  reachable?: boolean;
  seed?: number;
}

function towerWithVacantUnit({ unit, priceLevel = 'normal', reachable = true, seed = 1 }: Options) {
  const plan = {
    ...plainTowerPlan(3, 0, 99),
    seed,
    units: [{ type: unit, x: 60, level: 2 }],
  };
  const { state, unitIds } = buildTower(plan);
  if (reachable) addFlight(state, 'stairs', 20, 1);
  const id = unitIds[0] as UnitId;
  (state.units[id] as { price: number }).price = priceOfLevel(unit, priceLevel);
  return { state, id };
}

function prospectCount(state: TowerState): number {
  return countPeopleByKind(state.people).prospect ?? 0;
}

describe('prospect rolls', () => {
  it.each<[PriceLevel, number]>([
    ['high', 0.1],
    ['normal', 0.2],
    ['low', 0.3],
    ['minimum', 0.4],
  ])('send a prospect to a %s unit about %s of the time', (priceLevel, expected) => {
    const seeds = 500;
    let sent = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { state } = towerWithVacantUnit({ unit: 'office', priceLevel, seed });
      sent += prospectCount(engine.step(state, [], FIRST_LEASE_ROLL).state);
    }
    expect(sent / seeds).toBeGreaterThan(expected - 0.06);
    expect(sent / seeds).toBeLessThan(expected + 0.06);
  });

  it('do not happen before 07:00', () => {
    const { state } = towerWithVacantUnit({ unit: 'office', priceLevel: 'minimum' });
    expect(prospectCount(engine.step(state, [], FIRST_LEASE_ROLL - 1).state)).toBe(0);
  });

  it('skip offices at the weekend but not shops or condos', () => {
    const outcome = (unit: 'office' | 'retail-shop' | 'condo') => {
      let sent = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const { state } = towerWithVacantUnit({ unit, priceLevel: 'minimum', seed });
        const weekend = { ...state, step: SATURDAY };
        sent += prospectCount(engine.step(weekend, [], FIRST_ROLL).state);
      }
      return sent;
    };
    expect(outcome('office')).toBe(0);
    expect(outcome('retail-shop')).toBeGreaterThan(0);
    expect(outcome('condo')).toBeGreaterThan(0);
  });

  it('never fill a unit with no route from the street', () => {
    const { state, id } = towerWithVacantUnit({
      unit: 'office',
      priceLevel: 'minimum',
      reachable: false,
    });
    const after = engine.step(state, [], 3 * STEPS_PER_DAY).state;
    expect(after.units[id]?.lease).toBeNull();
    expect(prospectCount(after)).toBe(0);
  });
});

describe('prospect move-in', () => {
  it('signs the lease at the step the prospect arrives and sends the prospect away', () => {
    // The prospect walks in from the map edge first, so the lease is signed some time after the roll.
    const { state, id } = towerWithVacantUnit({ unit: 'office', priceLevel: 'minimum', seed: 2 });
    const { state: after, events } = engine.step(state, [], STEPS_PER_DAY);
    const signed = events.filter((event) => event.type === 'leaseSigned');
    expect(signed).toHaveLength(1);
    const lease = after.units[id]?.lease;
    // Rent counts from 07:00 whatever minute the prospect arrived in the lease window.
    expect(lease?.anchorStep).toBe(7 * STEPS_PER_HOUR);
    expect(signed[0]?.step).toBeGreaterThanOrEqual(7 * STEPS_PER_HOUR);
    expect(signed[0]?.step).toBeLessThan(9 * STEPS_PER_HOUR);
    expect(prospectCount(after)).toBe(0);
  });

  it('creates the office workers when the tenant moves in', () => {
    const { state, id } = towerWithVacantUnit({ unit: 'office', priceLevel: 'minimum', seed: 2 });
    expect(countPeopleByKind(state.people).officeWorker ?? 0).toBe(0);
    const { state: after } = engine.step(state, [], STEPS_PER_DAY);
    expect(after.units[id]?.lease).toBeDefined();
    const workers = listPeople(after.people).filter((person) => person.kind === 'officeWorker');
    expect(workers.length).toBeGreaterThan(0);
    expect(workers.every((person) => person.homeUnit === id)).toBe(true);
  });

  it('sends a prospect still in the tower away at 03:00', () => {
    const { state } = towerWithVacantUnit({ unit: 'office', reachable: false });
    addPerson(state, { kind: 'prospect', homeUnit: 1, level: 1, column: 5 });
    expect(prospectCount(engine.step(state, [], 3 * STEPS_PER_HOUR - 1).state)).toBe(1);
    expect(prospectCount(engine.step(state, [], 3 * STEPS_PER_HOUR).state)).toBe(0);
  });

  it('sells a condo, keeps the prospect as a resident and moves the rest of the household in', () => {
    const { state, id } = towerWithVacantUnit({ unit: 'condo', priceLevel: 'minimum' });
    const { state: after, events } = engine.step(state, [], STEPS_PER_DAY);
    const sold = events.filter((event) => event.type === 'condoSold');
    expect(sold).toHaveLength(1);
    expect(after.units[id]?.sale?.anchorStep).toBe(sold[0]?.step);
    const people = listPeople(after.people);
    const residents = people.filter((person) => person.kind === 'resident');
    const children = people.filter((person) => person.kind === 'child');
    expect(residents.length).toBeGreaterThanOrEqual(1);
    expect(residents.length).toBeLessThanOrEqual(2);
    expect(residents.length + children.length).toBeLessThanOrEqual(3);
    expect(people.every((person) => person.homeUnit === 'u1')).toBe(true);
    expect(prospectCount(after)).toBe(0);
  });

  it('sends the whole condo household walking in together, with nobody appearing inside', () => {
    let walking: TowerState | null = null;
    for (let seed = 1; walking === null && seed < 50; seed++) {
      const { state } = towerWithVacantUnit({ unit: 'condo', priceLevel: 'minimum', seed });
      const afterRoll = engine.step(state, [], FIRST_ROLL).state;
      if (prospectCount(afterRoll) > 0) walking = afterRoll;
    }
    if (walking === null) throw new Error('No seed sent a prospect');
    const counts = countPeopleByKind(walking.people);
    expect(prospectCount(walking)).toBeGreaterThanOrEqual(1);
    expect(prospectCount(walking) + (counts.child ?? 0)).toBeLessThanOrEqual(3);
    expect(counts.resident ?? 0).toBe(0);
  });

  it('removes a prospect on the way when the unit is demolished', () => {
    let walking: TowerState | null = null;
    let unitId = '';
    for (let seed = 1; walking === null && seed < 50; seed++) {
      const { state, id } = towerWithVacantUnit({ unit: 'office', priceLevel: 'minimum', seed });
      const afterRoll = engine.step(state, [], FIRST_ROLL).state;
      if (prospectCount(afterRoll) === 1) {
        walking = afterRoll;
        unitId = id;
      }
    }
    if (walking === null) throw new Error('No seed sent a prospect');
    const command = { type: 'demolish' as const, target: { kind: 'unit' as const, id: unitId } };
    const { state: after, results } = engine.step(walking, [{ id: 'c1', command }], 1);
    expect(results[0]?.ok).toBe(true);
    expect(prospectCount(after)).toBe(0);
  });
});
