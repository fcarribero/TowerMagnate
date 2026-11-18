import {
  LAST_COLUMN,
  SECURITY_OFFICE_SPOTS,
  SECURITY_SHIFTS,
  SECURITY_SPOTS,
  UNIT_CATALOG,
  type TowerState,
  type UnitId,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { outfitOf } from './outfit';
import { addPeopleForUnit, addPerson, slotOfPerson } from './people';
import { currentShiftOf, policeRosterOf, seatShiftOnDuty } from './police';
import { encodePoliceRoutine, isPhaseOnDuty, isPolice, policePhaseAt } from './police-phase';
import { createEngine, step, type StepContext } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { createTrekSystem, isOnTrek, startTrek, trekPhaseAt } from './trek';

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

/**
 * Levels 1 to 4, 200 columns. Stairs lead from the lobby to level 3; level 4 has an office that
 * only the elevator reaches. The security office is on level 2.
 */
function policeTower(): { state: TowerState; office: UnitId } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(4, 0, 199),
    units: [
      { type: 'security', level: 2, x: 100 },
      { type: 'fast-food', level: 3, x: 40 },
      { type: 'retail-shop', level: 3, x: 70 },
      { type: 'office', level: 3, x: 150 },
      { type: 'office', level: 4, x: 100 },
    ],
    flights: [
      { type: 'stairs', x: 10, level: 1 },
      { type: 'stairs', x: 20, level: 2 },
    ],
    shafts: [{ type: 'standard', x: 120, bottom: 1, top: 4 }],
  });
  const office = unitIds[0] as UnitId;
  addPeopleForUnit(state, office);
  return { state, office };
}

function policeSlots(state: TowerState): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < state.people.id.length; slot++) {
    if (isPolice(state.people, slot)) slots.push(slot);
  }
  return slots;
}

function onDutyCount(state: TowerState): number {
  return policeSlots(state).filter((slot) => isPhaseOnDuty(policePhaseAt(state.people, slot)))
    .length;
}

function advanceTo(state: TowerState, target: number): TowerState {
  return step(state, [], target - state.step).state;
}

describe('police roster', () => {
  it('holds 3 shifts of 7 officers in the office, off duty at the start', () => {
    const { state, office } = policeTower();
    const roster = policeRosterOf(state.people, Number(office.slice(1)));
    expect(roster).toHaveLength(SECURITY_SHIFTS * SECURITY_SPOTS);
    expect(policeSlots(state)).toHaveLength(21);
    expect(onDutyCount(state)).toBe(0);
    for (const slot of policeSlots(state)) {
      expect(outfitOf(state.people, slot)).toBeUndefined();
    }
  });

  it('tells the shift from the time of day: 00:00, 08:00 and 16:00', () => {
    expect([0, 7, 8, 15, 16, 23].map((hour) => currentShiftOf(at(0, hour)))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(currentShiftOf(at(1, 0))).toBe(0);
  });
});

describe('police arrival', () => {
  it('walk in from a map edge in civilian clothes and change in the office before working', () => {
    const { state, office } = policeTower();
    const unit = state.units[office];
    let current = state;
    const changing = new Map<number, number>();
    const arrivingSeen = new Set<number>();
    for (let count = 0; count < 2000; count++) {
      current = step(current, [], 1).state;
      for (const slot of policeSlots(current)) {
        const pool = current.people;
        const id = pool.id[slot] as number;
        const phase = policePhaseAt(pool, slot);
        if (phase === 'arriving') {
          arrivingSeen.add(id);
          expect(outfitOf(pool, slot)).toBeUndefined();
          if (count < 3) {
            // Nobody appears inside the tower: the first step is on the ground, at an edge.
            expect(pool.level[slot]).toBe(1);
            const column = pool.column[slot] as number;
            expect(column <= 2 || column >= LAST_COLUMN - 2).toBe(true);
          }
        }
        if (phase === 'changingIn') {
          changing.set(id, (changing.get(id) ?? 0) + 1);
          expect(outfitOf(pool, slot)).toBeUndefined();
          expect(pool.level[slot]).toBe(unit?.level);
        }
        if (phase === 'working') expect(outfitOf(pool, slot)).toBe('uniform');
      }
    }
    // The first shift is the only one in its window at 00:00.
    expect(arrivingSeen.size).toBe(SECURITY_SPOTS);
    expect(changing.size).toBe(SECURITY_SPOTS);
    for (const steps of changing.values()) expect(steps).toBe(2);
    expect(onDutyCount(current)).toBe(SECURITY_SPOTS);
  });
});

describe('police going home', () => {
  it('change back in the office, walk out through the lobby and stand off duty at a map edge', () => {
    const { state, office } = policeTower();
    const roster = policeRosterOf(state.people, Number(office.slice(1)));
    const firstShift = roster.slice(0, SECURITY_SPOTS);
    let current = advanceTo(state, at(0, 3));
    const sequence = new Map<number, string[]>();
    const steps = new Map<number, Record<string, number>>();
    for (const slot of firstShift) sequence.set(current.people.id[slot] as number, []);
    while (current.step < at(0, 12)) {
      current = step(current, [], 1).state;
      const pool = current.people;
      for (const slot of firstShift) {
        const id = pool.id[slot] as number;
        const phase = policePhaseAt(pool, slot);
        const list = sequence.get(id) as string[];
        if (list[list.length - 1] !== phase) list.push(phase);
        if (phase === 'changingOut') {
          expect(outfitOf(pool, slot)).toBe('uniform');
          expect(pool.level[slot]).toBe(2);
        }
        if (phase === 'leaving') expect(outfitOf(pool, slot)).toBeUndefined();
        const counts = steps.get(id) ?? {};
        counts[phase] = (counts[phase] ?? 0) + 1;
        steps.set(id, counts);
        if (phase === 'off' && list.length > 1) {
          const column = pool.column[slot] as number;
          expect(pool.level[slot]).toBe(1);
          expect(column <= 2 || column >= LAST_COLUMN - 2).toBe(true);
        }
      }
    }
    for (const id of sequence.keys()) {
      const list = sequence.get(id) as string[];
      expect(list.slice(-3)).toEqual(['changingOut', 'leaving', 'off']);
      expect(steps.get(id)?.changingOut).toBe(2);
      // Walking out takes real time: the officer does not vanish in a step.
      expect(steps.get(id)?.leaving).toBeGreaterThan(20);
    }
  });
});

/** One full day of per-step observations, from 03:00 on day 0 to 03:00 on day 1. */
function observeDay() {
  const { state, office } = policeTower();
  const roster = policeRosterOf(state.people, Number(office.slice(1)));
  let current = advanceTo(state, at(0, 3));
  const counts: number[] = [];
  const onDuty = new Set<number>();
  const violations: string[] = [];
  const levels = new Set<number>();
  const phases = new Map<number, string>();
  const stops: string[] = [];
  let maxColumnsPerStep = 0;
  let walkedSteps = 0;
  let walkedColumns = 0;
  const lastColumn = new Map<number, number>();
  const patrolAt12: Record<string, number> = {};
  for (let count = 0; current.step < at(1, 3); count++) {
    current = step(current, [], 1).state;
    const pool = current.people;
    counts.push(onDutyCount(current));
    roster.forEach((slot, index) => {
      const id = pool.id[slot] as number;
      const phase = policePhaseAt(pool, slot);
      const before = phases.get(id) ?? 'off';
      if (isPhaseOnDuty(phase)) onDuty.add(id);
      if (phase === 'patrolling' || phase === 'lingering' || phase === 'returning') {
        levels.add(pool.level[slot] as number);
      }
      const trek = trekPhaseAt(pool, slot);
      if (phase === 'patrolling' && trek === 'walkingToDestination') {
        const previous = lastColumn.get(id);
        const column = pool.column[slot] as number;
        if (previous !== undefined) {
          walkedSteps += 1;
          walkedColumns += Math.abs(column - previous);
          maxColumnsPerStep = Math.max(maxColumnsPerStep, Math.abs(column - previous));
        }
        lastColumn.set(id, column);
      } else lastColumn.delete(id);
      if (phase === 'patrolling' && before !== 'patrolling' && isOnTrek(pool, slot)) {
        // A patrol walks to open floor beside a unit, never into the unit.
        const stopsInUnit = Object.values(current.units).some(
          (unit) =>
            unit.type !== 'security' &&
            unit.level === pool.trekLevel[slot] &&
            (pool.trekColumn[slot] as number) >= unit.x &&
            (pool.trekColumn[slot] as number) < unit.x + UNIT_CATALOG[unit.type].width,
        );
        if (stopsInUnit) violations.push(`step ${current.step}: patrol sent into a unit`);
      }
      if (phase === 'lingering' && before !== 'lingering') {
        const place = Object.values(current.units).find(
          (unit) =>
            unit.level === pool.level[slot] &&
            (pool.column[slot] as number) >= unit.x &&
            (pool.column[slot] as number) < unit.x + 40,
        );
        if (place) stops.push(place.type);
      }
      if (phase === 'changingOut' && before !== 'changingOut') {
        // Whoever goes home leaves only after the replacement is in the office and changed.
        const index2 = roster.indexOf(slot);
        const reliefIndex =
          ((Math.floor(index2 / SECURITY_SPOTS) + 1) % SECURITY_SHIFTS) * SECURITY_SPOTS +
          (index2 % SECURITY_SPOTS);
        const relief = roster[reliefIndex] as number;
        if (!isPhaseOnDuty(policePhaseAt(pool, relief))) {
          violations.push(`step ${current.step}: ${id} left before its relief`);
        }
      }
      phases.set(id, phase);
    });
    if (current.step === at(0, 12)) {
      for (const slot of roster) {
        const phase = policePhaseAt(pool, slot);
        if (phase === 'off' || phase === 'arriving' || phase === 'changingIn') continue;
        patrolAt12[phase] = (patrolAt12[phase] ?? 0) + 1;
      }
    }
  }
  return {
    counts,
    onDuty,
    violations,
    levels,
    stops,
    maxColumnsPerStep,
    walkedSteps,
    walkedColumns,
    patrolAt12,
  };
}

describe('police shifts over a day', () => {
  const day = observeDay();

  it('keeps at least 7 officers on duty at every step across the 08:00, 16:00 and 24:00 changes', () => {
    expect(Math.min(...day.counts)).toBeGreaterThanOrEqual(SECURITY_SPOTS);
    // The relief is in the office before the outgoing officer goes home, so the two overlap.
    expect(Math.max(...day.counts)).toBeGreaterThan(SECURITY_SPOTS);
    expect(Math.max(...day.counts)).toBeLessThanOrEqual(2 * SECURITY_SPOTS);
  });

  it('puts all 21 officers on duty during the day, each shift once', () => {
    expect(day.onDuty.size).toBe(SECURITY_SHIFTS * SECURITY_SPOTS);
  });

  it('lets an officer go home only after the relief of the same spot is in the office and changed', () => {
    expect(day.violations).toEqual([]);
  });

  it('keeps 3 officers inside the office and 4 on patrol in the middle of a shift', () => {
    const inside = day.patrolAt12.working ?? 0;
    const out = (day.patrolAt12.patrolling ?? 0) + (day.patrolAt12.lingering ?? 0);
    // The shift on now, plus the next shift's officers already waiting in the office.
    expect(out).toBe(SECURITY_SPOTS - SECURITY_OFFICE_SPOTS);
    expect(inside).toBeGreaterThanOrEqual(SECURITY_OFFICE_SPOTS);
  });

  it('rides the elevator to patrol levels the stairs do not reach', () => {
    expect([...day.levels].sort()).toEqual([2, 3, 4]);
  });

  it('visits shops and food more often than offices', () => {
    const commercial = day.stops.filter((type) => type === 'fast-food' || type === 'retail-shop');
    const others = day.stops.filter((type) => type === 'office');
    expect(day.stops.length).toBeGreaterThan(20);
    expect(commercial.length).toBeGreaterThan(others.length);
  });

  it('walks at half speed: never more than one column per step and about one per 2 steps', () => {
    expect(day.walkedSteps).toBeGreaterThan(200);
    expect(day.maxColumnsPerStep).toBe(1);
    expect(day.walkedColumns / day.walkedSteps).toBeCloseTo(0.5, 1);
  });
});

describe('police and other people', () => {
  function walkers() {
    const { state } = buildTower(plainTowerPlan(2, 0, 199));
    const policeId = addPerson(state, { kind: 'police', homeUnit: 0, level: 1, column: 50 });
    const workerId = addPerson(state, { kind: 'officeWorker', homeUnit: 0, level: 1, column: 50 });
    const context: StepContext = { state, events: [] };
    const pool = state.people;
    const policeSlot = slotOfPerson(pool, policeId);
    const workerSlot = slotOfPerson(pool, workerId);
    for (const slot of [policeSlot, workerSlot]) {
      expect(startTrek(context, slot, { level: 1, column: 150 })).toBe(true);
    }
    return { state, policeSlot, workerSlot };
  }

  it('never take a lane, so a worker walking the same way is not held up and passes through', () => {
    const { state, policeSlot, workerSlot } = walkers();
    const engine = createEngine({ commandHandlers: {}, systems: [createTrekSystem()] });
    const run = engine.step(state, [], 20);
    expect(run.state.people.column[workerSlot]).toBe(70);
    expect(run.state.people.column[policeSlot]).toBe(60);
  });

  it('walk one column every 2 steps, on the same steps of the clock', () => {
    const { state, policeSlot } = walkers();
    const engine = createEngine({ commandHandlers: {}, systems: [createTrekSystem()] });
    let current = state;
    const moved: number[] = [];
    for (let count = 0; count < 10; count++) {
      const before = current.people.column[policeSlot] as number;
      current = engine.step(current, [], 1).state;
      moved.push((current.people.column[policeSlot] as number) - before);
    }
    expect(moved.filter((delta) => delta === 1)).toHaveLength(5);
    expect(moved.every((delta, index) => delta === (index % 2 === 0 ? moved[0] : moved[1]))).toBe(
      true,
    );
  });

  it('on patrol may take an elevator to a level the stairs do not reach', () => {
    const { state, office } = policeTower();
    seatShiftOnDuty(state);
    const pool = state.people;
    const slot = policeRosterOf(pool, Number(office.slice(1)))[0] as number;
    const context: StepContext = { state, events: [] };
    const top = { level: 4, column: 104 } as const;
    pool.trip[slot] = encodePoliceRoutine({ phase: 'patrolling', entranceOnRight: false });
    expect(startTrek(context, slot, top)).toBe(true);
  });

  it('walking back to the office may use an elevator, so an officer far from it is not stuck', () => {
    const { state, office } = policeTower();
    seatShiftOnDuty(state);
    const pool = state.people;
    const slot = policeRosterOf(pool, Number(office.slice(1)))[0] as number;
    const context: StepContext = { state, events: [] };
    pool.level[slot] = 4;
    pool.column[slot] = 104;
    pool.trip[slot] = encodePoliceRoutine({ phase: 'returning', entranceOnRight: false });
    expect(startTrek(context, slot, { level: 2, column: 101 })).toBe(true);
  });
});

describe('police patrol targets', () => {
  it('never patrols condos: with only condos to visit the patrol spots stay in the office', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 199),
      units: [
        { type: 'security', level: 2, x: 100 },
        { type: 'condo', level: 3, x: 40 },
        { type: 'condo', level: 2, x: 150 },
      ],
      flights: [
        { type: 'stairs', x: 10, level: 1 },
        { type: 'stairs', x: 20, level: 2 },
      ],
    });
    addPeopleForUnit(state, unitIds[0] as UnitId);
    let current = advanceTo(state, at(0, 10));
    for (let minute = 0; minute < 120; minute += 5) {
      current = advanceTo(current, current.step + 5 * STEPS_PER_MINUTE);
      for (const slot of policeSlots(current)) {
        const phase = policePhaseAt(current.people, slot);
        expect(phase === 'patrolling' || phase === 'lingering').toBe(false);
      }
    }
  });
});
