import {
  SECURITY_ACCESS_CONTROL_SCORE,
  SECURITY_CAMERA_COLUMNS,
  SECURITY_SHIFTS,
  SECURITY_SPOTS,
  type BurningLevel,
  type Fire,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { tickFireFronts } from './events/fire-guards';
import { addPeopleForUnit } from './people';
import { policeRosterOf, watchedCells } from './police';
import { isPhaseOnDuty, isPolice, policePhaseAt } from './police-phase';
import { step, type StepContext } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { guardedBase } from './unit-evaluation';
import { unitNumber } from './units';

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

function securityTower(offices = 1): { state: TowerState; ids: UnitId[] } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(4, 0, 199),
    units: [
      ...Array.from({ length: offices }, (_, index) => ({
        type: 'security' as const,
        level: 2,
        x: 100 + index * 20,
      })),
      { type: 'fast-food', level: 3, x: 40 },
      { type: 'retail-shop', level: 3, x: 70 },
      { type: 'condo', level: 4, x: 20 },
    ],
    flights: [
      { type: 'stairs', x: 10, level: 1 },
      { type: 'stairs', x: 20, level: 2 },
      { type: 'stairs', x: 30, level: 3 },
    ],
  });
  const ids = unitIds.slice(0, offices) as UnitId[];
  for (const id of ids) addPeopleForUnit(state, id);
  state.money = 1_000_000_000;
  return { state, ids };
}

function runTo(state: TowerState, target: number): TowerState {
  return step(state, [], target - state.step).state;
}

function onDuty(state: TowerState, office: UnitId): number {
  const pool = state.people;
  let count = 0;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isPolice(pool, slot) || pool.homeUnit[slot] !== unitNumber(office)) continue;
    if (isPhaseOnDuty(policePhaseAt(pool, slot))) count += 1;
  }
  return count;
}

function buy(state: TowerState, unitId: UnitId, upgradeId: string): TowerState {
  const outcome = step(state, [{ id: 'c1', command: { type: 'buyUpgrade', unitId, upgradeId } }], 1);
  expect(outcome.results[0]).toMatchObject({ ok: true });
  return outcome.state;
}

describe('security offices (service-units 2.3)', () => {
  it('each office brings its own 21 officers, so two offices put twice as many on duty', () => {
    const one = runTo(securityTower(1).state, at(1, 12));
    const { state, ids } = securityTower(2);
    const two = runTo(state, at(1, 12));
    expect(policeRosterOf(two.people, unitNumber(ids[1] as UnitId))).toHaveLength(
      SECURITY_SHIFTS * SECURITY_SPOTS,
    );
    const first = onDuty(one, securityTower(1).ids[0] as UnitId);
    expect(onDuty(two, ids[0] as UnitId) + onDuty(two, ids[1] as UnitId)).toBe(first * 2);
  });

  it('the guards upgrade adds one officer to every shift at once, and one more is on duty', () => {
    const plain = securityTower(1);
    const before = onDuty(runTo(plain.state, at(1, 12)), plain.ids[0] as UnitId);
    const { state, ids } = securityTower(1);
    const office = ids[0] as UnitId;
    const bought = buy(state, office, 'guards');
    expect(policeRosterOf(bought.people, unitNumber(office))).toHaveLength(
      SECURITY_SHIFTS * (SECURITY_SPOTS + 1),
    );
    expect(onDuty(runTo(bought, at(1, 12)), office)).toBe(before + 1);
  });

  it('cameras watch the cells around officers on patrol; without cameras nothing is watched', () => {
    const plain = runTo(securityTower(1).state, at(1, 12));
    expect(watchedCells(plain)).toBeNull();

    const { state, ids } = securityTower(1);
    const watching = runTo(buy(state, ids[0] as UnitId, 'cameras'), at(1, 12));
    const pool = watching.people;
    const patrol = [...pool.id.keys()].find((slot) => {
      const phase = isPolice(pool, slot) ? policePhaseAt(pool, slot) : 'off';
      return phase === 'patrolling' || phase === 'lingering';
    });
    expect(patrol).toBeDefined();
    const level = pool.level[patrol as number] as number;
    const column = pool.column[patrol as number] as number;
    const row = watchedCells(watching)?.get(level);
    expect(row?.[column]).toBe(1);
    expect(row?.[Math.min(199, column + SECURITY_CAMERA_COLUMNS)]).toBe(1);
  });

  it('a fire system works on every fire front a minute, on top of the guards', () => {
    const contained = (fireSystem: number): number => {
      const { state, ids } = securityTower(1);
      const office = state.units[ids[0] as UnitId] as Unit;
      if (fireSystem > 0) office.upgrades = { fireSystem };
      state.step = at(1, 15);
      const burning: BurningLevel = {
        ignitionStep: state.step - 6,
        ignitionColumn: 80,
        left: { x: 80, progress: 0, out: false },
        right: { x: 80, progress: 0, out: false },
      };
      const fire = { kind: 'fire', level: 3, levels: { 3: burning }, guards: {} } as unknown as Fire;
      tickFireFronts({ state } as StepContext, fire);
      return burning.left.progress;
    };
    expect(contained(0)).toBe(0);
    expect(contained(2)).toBe(2);
  });

  it('access control takes stress off condos and suites only, never below 0', () => {
    const { state, ids } = securityTower(1);
    const condo = Object.values(state.units).find((unit) => unit.type === 'condo') as Unit;
    const fastFood = Object.values(state.units).find((unit) => unit.type === 'fast-food') as Unit;
    expect(guardedBase(state, condo, 100)).toBe(100);
    (state.units[ids[0] as UnitId] as Unit).upgrades = { accessControl: 2 };
    expect(guardedBase(state, condo, 100)).toBe(100 - 2 * SECURITY_ACCESS_CONTROL_SCORE);
    expect(guardedBase(state, condo, 10)).toBe(0);
    expect(guardedBase(state, fastFood, 100)).toBe(100);
  });
});
