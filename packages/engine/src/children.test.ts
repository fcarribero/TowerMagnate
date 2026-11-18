import {
  CONDO_PAIR_CHILD_CHANCE,
  PERSON_KINDS,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { childNameSeed, guardianSlotOf, rollCondoHousehold } from './children';
import { STEPS_PER_DAY } from './clock';
import { STEPS_PER_HOUR } from './calendar';
import { towerCommandHandlers } from './commands';
import { createElevatorSystem } from './elevators';
import {
  countPeopleByKind,
  listPeople,
  NOTHING_DUE,
  removePerson,
  removePeopleOfUnit,
  slotOfPerson,
} from './people';
import { isAsleep, isOutsideTower } from './outside-tower';
import { createProspectDemand } from './prospects';
import { TransportGraph } from './routing';
import { createScheduler } from './scheduler';
import { createEngine } from './step';
import { addPerson } from './people';
import { addCondoHousehold } from './people';
import { buildTower, plainTowerPlan, type PlannedShaft } from './testing';
import { createChildSystem, createTrekSystem, startTrek, trekPhaseAt } from './trek';
import { addFlight } from './testing';
import { createLeaseSystem } from './leases';

describe('condo household roll', () => {
  const units = Array.from({ length: 4000 }, (_, index) => index + 1);

  it('is deterministic for a unit and step and never uses the RNG', () => {
    for (const unit of [1, 7, 250]) {
      expect(rollCondoHousehold(unit, 12_345)).toEqual(rollCondoHousehold(unit, 12_345));
    }
    expect(childNameSeed(3, 99, 0)).toBe(childNameSeed(3, 99, 0));
  });

  it('holds 1 to 3 people with at least one adult', () => {
    for (const unit of units) {
      const { adults, children } = rollCondoHousehold(unit, 8 * STEPS_PER_HOUR);
      expect(adults).toBeGreaterThanOrEqual(1);
      expect(adults + children).toBeGreaterThanOrEqual(1);
      expect(adults + children).toBeLessThanOrEqual(3);
    }
  });

  it('makes a single person an adult and a trio two adults with one child', () => {
    const seen = new Set<number>();
    for (const unit of units) {
      const { adults, children } = rollCondoHousehold(unit, 4242);
      seen.add(adults + children);
      if (adults + children === 1) expect(children).toBe(0);
      if (adults + children === 3) expect({ adults, children }).toEqual({ adults: 2, children: 1 });
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('gives a pair a child about 30% of the time', () => {
    let pairs = 0;
    let withChild = 0;
    for (const unit of units) {
      const { adults, children } = rollCondoHousehold(unit, 777);
      if (adults + children !== 2) continue;
      pairs += 1;
      if (children === 1) withChild += 1;
    }
    expect(pairs).toBeGreaterThan(1200);
    expect(Math.abs(withChild / pairs - CONDO_PAIR_CHILD_CHANCE)).toBeLessThan(0.04);
  });

  it('follows the 20/40/40 weights for 1, 2 and 3 people', () => {
    const counts = [0, 0, 0, 0];
    for (const unit of units) {
      const { adults, children } = rollCondoHousehold(unit, 31);
      counts[adults + children] = (counts[adults + children] ?? 0) + 1;
    }
    expect(Math.abs((counts[1] ?? 0) / units.length - 0.2)).toBeLessThan(0.03);
    expect(Math.abs((counts[2] ?? 0) / units.length - 0.4)).toBeLessThan(0.03);
    expect(Math.abs((counts[3] ?? 0) / units.length - 0.4)).toBeLessThan(0.03);
  });

  it('stores the child kind after every older kind', () => {
    expect(PERSON_KINDS.indexOf('child')).toBeGreaterThan(PERSON_KINDS.indexOf('builder'));
    expect(PERSON_KINDS.indexOf('child')).toBe(PERSON_KINDS.indexOf('courier') + 1);
  });
});

const engine = createEngine({
  commandHandlers: {},
  systems: [createTrekSystem(), createElevatorSystem(), createChildSystem()],
});

const shaft: PlannedShaft = { type: 'standard', x: 60, bottom: 1, top: 6 };
const SHAFT_COLUMN = 62;
const HOME = 7;

function buildFamilyTower(): TowerState {
  return buildTower({ ...plainTowerPlan(6, 0, 99), shafts: [shaft] }).state;
}

function addHome(state: TowerState, kind: 'resident' | 'child', level = 1): number {
  return addPerson(state, { kind, homeUnit: HOME, level, column: SHAFT_COLUMN, nameSeed: 1 });
}

function view(state: TowerState, id: number) {
  const slot = slotOfPerson(state.people, id);
  return {
    slot,
    level: state.people.level[slot] as number,
    column: state.people.column[slot] as number,
    phase: trekPhaseAt(state.people, slot),
    dueStep: state.people.dueStep[slot] as number,
  };
}

function send(state: TowerState, id: number, to: { level: number; column: number }): void {
  const context = { state, events: [], graph: new TransportGraph(state) };
  startTrek(context, slotOfPerson(state.people, id), to as never);
}

function car(state: TowerState) {
  return (Object.values(state.shafts)[0] as Shaft).cars[0];
}

describe('children following a guardian', () => {
  it('queue right behind the guardian, board the same car and get off at the same floor', () => {
    let state = buildFamilyTower();
    const child = addHome(state, 'child');
    const adult = addHome(state, 'resident');
    send(state, adult, { level: 4, column: 30 });
    expect(view(state, adult).phase).toBe('queued');
    expect(view(state, child).phase).toBe('queued');
    const queue = Object.values((Object.values(state.shafts)[0] as Shaft).queues)[0]?.up ?? [];
    expect(queue.map((entry) => entry.person)).toEqual([`p${adult}`, `p${child}`]);
    expect(view(state, child).column).toBe(view(state, adult).column + 1);

    let apartSteps = 0;
    let longestApart = 0;
    let together = 0;
    for (let count = 0; count < 600; count++) {
      state = engine.step(state, [], 1).state;
      const riders = car(state)?.riders ?? [];
      const adultIn = riders.includes(`p${adult}`);
      const childIn = riders.includes(`p${child}`);
      if (adultIn && childIn) together += 1;
      apartSteps = adultIn !== childIn ? apartSteps + 1 : 0;
      longestApart = Math.max(longestApart, apartSteps);
      if (view(state, adult).phase === 'idle' && view(state, child).phase === 'idle') break;
    }
    expect(together).toBeGreaterThan(0);
    expect(longestApart).toBeLessThanOrEqual(1);
    expect(view(state, adult)).toMatchObject({ level: 4, column: 30, phase: 'idle' });
    expect(view(state, child)).toMatchObject({ level: 4, column: 30, phase: 'idle' });
    expect(car(state)?.riders).toEqual([]);
  });

  it('never starts a trek or schedules anything of its own', () => {
    let state = buildFamilyTower();
    const child = addHome(state, 'child', 3);
    const adult = addHome(state, 'resident', 3);
    for (let count = 0; count < 50; count++) state = engine.step(state, [], 1).state;
    expect(view(state, child)).toMatchObject({ phase: 'idle', dueStep: NOTHING_DUE, level: 3 });
    send(state, adult, { level: 5, column: 70 });
    for (let count = 0; count < 30; count++) {
      state = engine.step(state, [], 1).state;
      expect(view(state, child).dueStep).toBe(NOTHING_DUE);
    }
  });

  it('stays home when the second adult goes out and the designated guardian stays', () => {
    let state = buildFamilyTower();
    const guardian = addHome(state, 'resident', 2);
    const other = addHome(state, 'resident', 2);
    const child = addHome(state, 'child', 2);
    expect(guardianSlotOf(state.people, slotOfPerson(state.people, child))).toBe(
      slotOfPerson(state.people, guardian),
    );
    send(state, other, { level: 5, column: 70 });
    expect(view(state, other).phase).not.toBe('idle');
    for (let count = 0; count < 12; count++) {
      state = engine.step(state, [], 1).state;
      expect(view(state, child)).toMatchObject({ level: 2, column: SHAFT_COLUMN, phase: 'idle' });
    }
  });

  it('boards only when the car has room for the guardian and the child together', () => {
    let state = buildFamilyTower();
    const child = addHome(state, 'child');
    const adult = addHome(state, 'resident');
    const theCar = car(state);
    if (!theCar) throw new Error('no car');
    for (let index = 0; index < 20; index++) {
      theCar.riders.push(`p${9000 + index}`);
      theCar.trips.push({ destination: 6, boardedStep: 0, waitSteps: 0 });
    }
    send(state, adult, { level: 4, column: 30 });
    let apartSteps = 0;
    let longestApart = 0;
    for (let count = 0; count < 400; count++) {
      state = engine.step(state, [], 1).state;
      const riders = car(state)?.riders ?? [];
      const adultIn = riders.includes(`p${adult}`);
      const childIn = riders.includes(`p${child}`);
      apartSteps = adultIn !== childIn ? apartSteps + 1 : 0;
      longestApart = Math.max(longestApart, apartSteps);
    }
    expect(longestApart).toBeLessThanOrEqual(1);
    expect(view(state, adult)).toMatchObject({ level: 4, phase: 'idle' });
    expect(view(state, child)).toMatchObject({ level: 4, phase: 'idle' });
  });

  it('is removed with the household and when the last adult is gone', () => {
    const state = buildFamilyTower();
    const child = addHome(state, 'child');
    const adult = addHome(state, 'resident');
    const gone = removePeopleOfUnit(state, `u${HOME}`);
    expect(gone).toContain(`p${child}`);
    expect(listPeople(state.people)).toHaveLength(0);

    const other = buildFamilyTower();
    const orphan = addHome(other, 'child');
    const parent = addHome(other, 'resident');
    removePerson(other, parent);
    const after = engine.step(other, [], 1).state;
    expect(slotOfPerson(after.people, orphan)).toBe(-1);
    expect(adult).toBeGreaterThan(0);
  });

  it('sleeps and goes out with the guardian', () => {
    const state = buildFamilyTower();
    const adult = addHome(state, 'resident');
    const child = addHome(state, 'child');
    const adultSlot = slotOfPerson(state.people, adult);
    const childSlot = slotOfPerson(state.people, child);
    state.people.trip[adultSlot] = 0;
    expect(isAsleep(state.people, childSlot)).toBe(isAsleep(state.people, adultSlot));
    expect(isOutsideTower(state.people, childSlot)).toBe(isOutsideTower(state.people, adultSlot));
  });
});

describe('condo households coming in', () => {
  it('creates a lived-in condo with the rolled people, adults first', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 99),
      units: [{ type: 'condo', x: 20, level: 2 }],
    });
    const created = addCondoHousehold(state, unitIds[0] as never);
    const counts = countPeopleByKind(state.people);
    expect(created.length).toBe((counts.resident ?? 0) + (counts.child ?? 0));
    expect(counts.resident ?? 0).toBeGreaterThanOrEqual(1);
    expect(created.length).toBeLessThanOrEqual(3);
  });

  it('walks a household with a child in together and keeps the child with its guardian', () => {
    const demand = createProspectDemand();
    const walkEngine = createEngine({
      commandHandlers: towerCommandHandlers,
      systems: [
        createScheduler(demand.rollHooks),
        createLeaseSystem(),
        createTrekSystem(),
        demand.system,
        createElevatorSystem(),
        createChildSystem(),
      ],
    });
    let found: TowerState | null = null;
    for (let seed = 1; found === null && seed < 400; seed++) {
      const { state, unitIds } = buildTower({
        ...plainTowerPlan(3, 0, 99),
        seed,
        units: [{ type: 'condo', x: 60, level: 2 }],
      });
      addFlight(state, 'stairs', 20, 1);
      (state.units[unitIds[0] as never] as { priceLevel: string }).priceLevel = 'minimum';
      const afterRoll = walkEngine.step(
        { ...state, step: seed * STEPS_PER_DAY },
        [],
        8 * STEPS_PER_HOUR,
      ).state;
      if ((countPeopleByKind(afterRoll.people).child ?? 0) > 0) found = afterRoll;
    }
    if (found === null) throw new Error('No seed made a household with a child');
    expect(countPeopleByKind(found.people).prospect ?? 0).toBeGreaterThanOrEqual(1);
    const settled = walkEngine.step(found, [], STEPS_PER_DAY).state;
    const people = listPeople(settled.people);
    const child = people.find((person) => person.kind === 'child');
    const guardian = people.find((person) => person.kind === 'resident');
    expect(child).toBeDefined();
    expect(guardian).toBeDefined();
    expect(child?.homeUnit).toBe(guardian?.homeUnit);
    expect(people.length).toBeLessThanOrEqual(3);
  });
});
