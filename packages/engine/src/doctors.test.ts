import { DOCTORS_PER_SHIFT, type QueuedCommand, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  decodeDoctorTask,
  doctorShiftAt,
  doctorSlotsOf,
  encodeDoctorTask,
  isDoctor,
} from './doctors';
import { outfitOf } from './outfit';
import { deserializeState, serializeState } from './serialization';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';

const CENTER = 'u1';

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + hour * STEPS_PER_HOUR + minute * STEPS_PER_MINUTE;
}

/** A medical center on level 3 reached by an elevator, at 05:00 on day 0. */
function tower(): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(3, 0, 120),
    shafts: [{ type: 'standard', x: 30, bottom: 1, top: 3, cars: 2 }],
    units: [{ type: 'medical-center', level: 3, x: 60 }],
  });
  state.money = 99_999_999;
  state.stars = 6;
  state.step = at(0, 5);
  return state;
}

function runTo(state: TowerState, target: number): TowerState {
  return step(state, [], target - state.step).state;
}

function doctors(state: TowerState) {
  const pool = state.people;
  return doctorSlotsOf(pool, 1).map((slot) => ({
    slot,
    task: decodeDoctorTask(pool.trip[slot] ?? 0),
    level: pool.level[slot],
    outfit: outfitOf(pool, slot),
  }));
}

function working(state: TowerState): number {
  return doctors(state).filter((doctor) => doctor.task?.phase === 'working').length;
}

describe('doctor tasks', () => {
  it('round-trip every phase, shift and spot and are never zero', () => {
    for (const phase of ['arriving', 'changingIn', 'working', 'changingOut', 'leaving'] as const) {
      for (const shift of [0, 1]) {
        for (let spot = 0; spot < DOCTORS_PER_SHIFT; spot++) {
          const code = encodeDoctorTask({ phase, shift, spot });
          expect(code).toBeGreaterThan(0);
          expect(decodeDoctorTask(code)).toEqual({ phase, shift, spot });
        }
      }
    }
  });

  it('runs the day shift from 08:00 and the night shift from 20:00', () => {
    expect(doctorShiftAt(at(0, 8))).toBe(0);
    expect(doctorShiftAt(at(0, 19, 59))).toBe(0);
    expect(doctorShiftAt(at(0, 20))).toBe(1);
    expect(doctorShiftAt(at(1, 7, 59))).toBe(1);
  });
});

describe('medical center doctors', () => {
  it('brings in four day doctors who arrive in everyday clothes and work in the white coat', () => {
    let state = runTo(tower(), at(0, 7, 5));
    // At 05:00 the night shift is on, so the new center first gets four night doctors.
    const arriving = doctors(state).filter((doctor) => doctor.task?.shift === 0);
    expect(arriving).toHaveLength(DOCTORS_PER_SHIFT);
    expect(arriving.every((doctor) => doctor.task?.shift === 0)).toBe(true);
    expect(new Set(arriving.map((doctor) => doctor.task?.spot))).toEqual(new Set([0, 1, 2, 3]));
    expect(arriving.every((doctor) => doctor.outfit === undefined)).toBe(true);
    state = runTo(state, at(0, 9));
    expect(working(state)).toBe(DOCTORS_PER_SHIFT);
    expect(doctors(state)).toHaveLength(DOCTORS_PER_SHIFT);
    for (const doctor of doctors(state)) {
      expect(doctor.level).toBe(3);
      expect(doctor.outfit).toBe('uniform');
    }
  });

  it('keeps four doctors at work around the clock, the night shift relieving the day one', () => {
    let state = runTo(tower(), at(0, 8));
    let least = Number.POSITIVE_INFINITY;
    let most = 0;
    while (state.step < at(1, 8, 30)) {
      state = runTo(state, state.step + STEPS_PER_MINUTE);
      least = Math.min(least, working(state));
      most = Math.max(most, doctors(state).length);
    }
    expect(least).toBeGreaterThanOrEqual(DOCTORS_PER_SHIFT);
    // At a change of shift both shifts are briefly in the tower, never more.
    expect(most).toBeLessThanOrEqual(2 * DOCTORS_PER_SHIFT);
    // After the morning change only the day shift is left.
    state = runTo(state, at(1, 10));
    expect(doctors(state).map((doctor) => doctor.task?.shift)).toEqual([0, 0, 0, 0]);
  });

  it('sends the day doctors home only after the night doctor of the same spot is at work', () => {
    let state = runTo(tower(), at(0, 19, 55));
    while (state.step < at(0, 22)) {
      state = runTo(state, state.step + 1);
      for (const doctor of doctors(state)) {
        if (doctor.task?.shift !== 0 || doctor.task.phase !== 'changingOut') continue;
        const relief = doctors(state).find(
          (other) => other.task?.shift === 1 && other.task.spot === doctor.task?.spot,
        );
        expect(relief?.task?.phase).toBe('working');
      }
    }
  });

  it('records no stress for doctors', () => {
    const state = runTo(tower(), at(0, 12));
    for (const doctor of doctors(state)) expect(state.people.stress[doctor.slot]).toBe(0);
  });

  it('keeps the doctors through a save and restore', () => {
    const state = runTo(tower(), at(0, 12));
    const restored = deserializeState(serializeState(state));
    expect(doctors(restored).map((doctor) => doctor.task)).toEqual(
      doctors(state).map((doctor) => doctor.task),
    );
  });

  it('removes the doctors when the medical center is demolished', () => {
    const state = runTo(tower(), at(0, 12));
    const demolish: QueuedCommand = {
      id: 'c1',
      command: { type: 'demolish', target: { kind: 'unit', id: CENTER } },
    };
    const after = step(state, [demolish], STEPS_PER_MINUTE).state;
    let left = 0;
    for (let slot = 0; slot < after.people.id.length; slot++)
      if (isDoctor(after.people, slot)) left += 1;
    expect(left).toBe(0);
  });
});
