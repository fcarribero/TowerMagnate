import { PERSON_KINDS, VENUE_STAFF, type TowerState, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { isOutsideTower } from './outside-tower';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';
import {
  addCrew,
  crewOf,
  decodeStaffRoutine,
  encodeStaffRoutine,
  isCarryingBag,
  isVenueStaffed,
  staffRoutineAt,
  type StaffPhase,
} from './venue-staff';

const STAFF_KIND = PERSON_KINDS.indexOf('staff');
const DAY = 1;

type VenueType = keyof typeof VENUE_STAFF;

function venueTower(type: VenueType): { state: TowerState; id: UnitId } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 80),
    units: [{ type, x: 40, level: 1 }],
  });
  const id = unitIds[0] as UnitId;
  const unit = state.units[id];
  if (type === 'retail-shop' && unit) {
    unit.lease = { anchorStep: 0, nextDueStep: STEPS_PER_DAY * 30, weekVisits: 0 };
  }
  addCrew(state, id, { planToday: false });
  return { state, id };
}

function staffSlots(state: TowerState): number[] {
  const slots: number[] = [];
  state.people.kind.forEach((kind, slot) => {
    if (kind === STAFF_KIND) slots.push(slot);
  });
  return slots;
}

function phases(state: TowerState): (StaffPhase | undefined)[] {
  return staffSlots(state).map((slot) => staffRoutineAt(state.people, slot)?.phase);
}

function garbageOf(state: TowerState, id: UnitId): number {
  return state.units[id]?.venue?.garbage ?? 0;
}

/** Runs from 00:00 of DAY, one minute at a time, calling `watch` after each minute until `untilHour`. */
function runDay(
  start: TowerState,
  untilHour: number,
  watch: (state: TowerState, minuteOfDay: number) => void,
): TowerState {
  let state = structuredClone(start);
  state.step = DAY * STEPS_PER_DAY - 1;
  state = step(state, [], 1).state;
  const end = DAY * STEPS_PER_DAY + untilHour * STEPS_PER_HOUR;
  while (state.step < end) {
    state = step(state, [], STEPS_PER_MINUTE).state;
    watch(state, Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_MINUTE));
  }
  return state;
}

describe('staff routine packing', () => {
  it('round-trips every phase and entrance', () => {
    const all: StaffPhase[] = ['outside', 'walkingIn', 'working', 'toPile', 'carrying', 'leaving'];
    for (const phase of all) {
      for (const entranceOnRight of [false, true]) {
        const routine = { phase, entranceOnRight };
        expect(decodeStaffRoutine(encodeStaffRoutine(routine))).toEqual(routine);
      }
    }
    expect(decodeStaffRoutine(0)).toBeNull();
  });
});

describe('a venue crew', () => {
  it('is hired to the size of the type, and only once', () => {
    const { state, id } = venueTower('fast-food');
    expect(crewOf(state, { id })).toBe(VENUE_STAFF['fast-food'].crew);
    expect(addCrew(state, id)).toEqual([]);
  });

  it('counts as staffed when the venue has no crew at all', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 80),
      units: [{ type: 'restaurant', x: 40, level: 1 }],
    });
    const unit = state.units[unitIds[0] as UnitId];
    expect(unit && isVenueStaffed(state, unit)).toBe(true);
  });

  it('opens only once every crew member is inside, and keeps the others out of sight', () => {
    const { state, id } = venueTower('cinema');
    let firstStaffed = -1;
    let sawPartial = false;
    runDay(state, 14, (now, minute) => {
      const unit = now.units[id];
      if (!unit) return;
      const nowPhases = phases(now);
      const working = nowPhases.filter((phase) => phase === 'working').length;
      const staffed = isVenueStaffed(now, unit);
      if (staffed) expect(working).toBe(VENUE_STAFF.cinema.crew);
      else if (working > 0) sawPartial = true;
      if (staffed && firstStaffed < 0) firstStaffed = minute;
      staffSlots(now).forEach((slot, index) => {
        if (nowPhases[index] === 'outside') expect(isOutsideTower(now.people, slot)).toBe(true);
      });
    });
    expect(firstStaffed).toBeGreaterThanOrEqual(VENUE_STAFF.cinema.open - 60);
    expect(firstStaffed).toBeLessThanOrEqual(VENUE_STAFF.cinema.open);
    expect(sawPartial).toBe(true);
  });
});

describe('closing time', () => {
  it('leaves the pile of a restaurant, empties it and sends everyone out', () => {
    const { state, id } = venueTower('restaurant');
    let pile = 0;
    let carrying = 0;
    const end = runDay(state, 24, (now) => {
      pile = Math.max(pile, garbageOf(now, id));
      const bags = staffSlots(now).filter((slot) => isCarryingBag(now.people, slot)).length;
      carrying = Math.max(carrying, bags);
    });
    expect(pile).toBe(VENUE_STAFF.restaurant.bags);
    expect(carrying).toBeGreaterThan(0);
    expect(garbageOf(end, id)).toBe(0);
    for (const slot of staffSlots(end)) expect(isOutsideTower(end.people, slot)).toBe(true);
  });

  it('has a cinema crew go back for more bags while the pile has some', () => {
    const { state, id } = venueTower('cinema');
    const trips = new Map<number, number>();
    const wasCarrying = new Set<number>();
    const end = runDay(state, 24, (now) => {
      for (const slot of staffSlots(now)) {
        const person = now.people.id[slot] as number;
        const carrying = isCarryingBag(now.people, slot);
        if (carrying && !wasCarrying.has(person)) trips.set(person, (trips.get(person) ?? 0) + 1);
        if (carrying) wasCarrying.add(person);
        else wasCarrying.delete(person);
      }
    });
    const total = [...trips.values()].reduce((sum, count) => sum + count, 0);
    expect(VENUE_STAFF.cinema.bags).toBeGreaterThan(VENUE_STAFF.cinema.crew);
    expect(total).toBe(VENUE_STAFF.cinema.bags);
    expect(Math.max(...trips.values())).toBeGreaterThanOrEqual(2);
    expect(garbageOf(end, id)).toBe(0);
    for (const slot of staffSlots(end)) expect(isOutsideTower(end.people, slot)).toBe(true);
  });

  it('lets a shop crew leave without any bags', () => {
    const { state, id } = venueTower('retail-shop');
    let carried = false;
    const end = runDay(state, 22, (now) => {
      expect(garbageOf(now, id)).toBe(0);
      carried ||= staffSlots(now).some((slot) => isCarryingBag(now.people, slot));
    });
    expect(carried).toBe(false);
    for (const slot of staffSlots(end)) expect(isOutsideTower(end.people, slot)).toBe(true);
  });

  it('tops up a venue that has no crew at 00:00 and plans its arrival', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 80),
      units: [{ type: 'party-hall', x: 40, level: 1 }],
    });
    const id = unitIds[0] as UnitId;
    expect(staffSlots(state)).toHaveLength(0);
    const after = runDay(state, 1, () => undefined);
    expect(staffSlots(after)).toHaveLength(VENUE_STAFF['party-hall'].crew);
    expect(phases(after).every((phase) => phase === 'outside')).toBe(true);
    expect(crewOf(after, { id })).toBe(VENUE_STAFF['party-hall'].crew);
  });
});
