import type { EngineEvent, HotelRoom, TowerState, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE, stepOfDate, WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  checkIn,
  checkOutMinuteOf,
  createHotelSystem,
  drawStayNights,
  type CheckInResult,
} from './hotel';
import { createRng, nextInt } from './rng';
import { createEngine, type StepContext } from './step';
import { unitNumber } from './units';
import { buildTower, plainTowerPlan } from './testing';

type RoomType = 'single-room' | 'double-room' | 'suite';

const WEDNESDAY = 2;

function at(dayNumber: number, hour: number, minute = 0): number {
  return dayNumber * STEPS_PER_DAY + stepOfDate({ year: 1, month: 1, day: 1, hour, minute });
}

function towerWithRooms(types: RoomType[]): { tower: TowerState; roomIds: UnitId[] } {
  const units = types.map((type, index) => ({ type, x: index * 12, level: 2 }));
  const { state, unitIds } = buildTower({ ...plainTowerPlan(3, 0, 40), units });
  return { tower: state, roomIds: unitIds as UnitId[] };
}

function setHotel(tower: TowerState, roomId: UnitId, hotel: HotelRoom): void {
  (tower.units[roomId] as { hotel: HotelRoom }).hotel = hotel;
}

interface Attempt {
  result: CheckInResult;
  state: TowerState;
  events: EngineEvent[];
}

function tryCheckIn(tower: TowerState, roomId: UnitId, step: number): Attempt {
  const context: StepContext = { state: structuredClone(tower), events: [] };
  context.state.step = step;
  const result = checkIn(context, roomId);
  return { result, state: context.state, events: context.events };
}

function checkInWithSeed(tower: TowerState, roomId: UnitId, step: number, seed = 1) {
  const seeded = structuredClone(tower);
  seeded.rng = createRng(seed);
  return tryCheckIn(seeded, roomId, step);
}

/** The check-out step of a stay checked in at `checkInStep`: the next day, at the drawn minute. */
function checkOutStep(roomId: UnitId, checkInStep: number): number {
  const day = Math.floor(checkInStep / STEPS_PER_DAY) + 1;
  return day * STEPS_PER_DAY + checkOutMinuteOf(unitNumber(roomId), checkInStep) * STEPS_PER_MINUTE;
}

describe('hotel check-in', () => {
  it('charges nothing at check-in and the one night at the drawn check-out time the next morning', () => {
    const { tower, roomIds } = towerWithRooms(['suite']);
    const roomId = roomIds[0] as UnitId;
    const { result, state, events } = checkInWithSeed(tower, roomId, at(WEDNESDAY, 15));

    expect(result).toEqual({ checkedIn: true, nights: 1 });
    expect(state.money).toBe(tower.money);
    expect(state.ledger.currentWeek.hotel.income).toBe(0);
    expect(state.units[roomId]?.used).toBe(true);
    expect(state.units[roomId]?.hotel).toEqual({
      state: 'occupied',
      stayEndStep: checkOutStep(roomId, at(WEDNESDAY, 15)),
      checkInStep: at(WEDNESDAY, 15),
      paidRatio: 1,
      stayRate: 6_000,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    });
    expect(weekdayOfDay(WEDNESDAY + 1)).toBe(WEEKDAYS.thursday);
    expect(events.map((event) => event.type)).toEqual(['hotelCheckIn', 'roomStateChanged']);

    const engine = createEngine({ commandHandlers: {}, systems: [createHotelSystem()] });
    const checkOut = checkOutStep(roomId, at(WEDNESDAY, 15));
    const justBefore = engine.step(state, [], checkOut - 1 - state.step);
    expect(justBefore.state.units[roomId]?.hotel?.state).toBe('occupied');

    const atCheckOut = engine.step(justBefore.state, [], 1);
    expect(atCheckOut.state.step).toBe(checkOut);
    expect(atCheckOut.state.units[roomId]?.hotel).toMatchObject({
      state: 'dirty',
      stayEndStep: null,
    });
    expect(atCheckOut.state.units[roomId]?.evaluation).toBe('good');
    expect(atCheckOut.events.map((event) => event.type)).toEqual([
      'hotelCheckOut',
      'unitMoney',
      'roomStateChanged',
    ]);
    expect(atCheckOut.events.find((event) => event.type === 'hotelCheckOut')).toMatchObject({
      nights: 1,
      paid: 6_000,
    });
    expect(atCheckOut.events.find((event) => event.type === 'unitMoney')).toMatchObject({
      unitId: roomId,
      reason: 'hotel',
    });
    expect(atCheckOut.state.money - state.money).toBe(6_000);
    expect(atCheckOut.state.ledger.currentWeek.hotel.income).toBe(6_000);
  });

  it.each([
    ['single-room', 'minimum', 500],
    ['double-room', 'low', 2_000],
    ['single-room', 'high', 3_000],
  ] as const)('locks the $%i nightly price of a %s at check-in', (type, _label, price) => {
    const { tower, roomIds } = towerWithRooms([type]);
    const roomId = roomIds[0] as UnitId;
    tower.units[roomId]!.price = price;
    const { result, state } = checkInWithSeed(tower, roomId, at(WEDNESDAY, 12));
    expect(result).toEqual({ checkedIn: true, nights: 1 });
    expect(state.units[roomId]?.hotel?.stayRate).toBe(price);
  });

  it('accepts 12:00 and 23:00 and refuses 11:59 and 23:01', () => {
    const { tower, roomIds } = towerWithRooms(['single-room']);
    const roomId = roomIds[0] as UnitId;
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 11, 59)).result).toEqual({
      checkedIn: false,
      reason: 'outsideCheckInHours',
    });
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 12)).result.checkedIn).toBe(true);
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 23)).result.checkedIn).toBe(true);
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 23, 1)).result).toEqual({
      checkedIn: false,
      reason: 'outsideCheckInHours',
    });
  });

  it('changes nothing when a check-in is refused', () => {
    const { tower, roomIds } = towerWithRooms(['suite']);
    const step = at(WEDNESDAY, 23, 1);
    const refused = tryCheckIn(tower, roomIds[0] as UnitId, step);
    expect(refused.state).toEqual({ ...tower, step });
    expect(refused.events).toEqual([]);
  });

  it.each(['dirty', 'occupied', 'infested'] as const)('refuses a %s room', (state) => {
    const { tower, roomIds } = towerWithRooms(['double-room']);
    const roomId = roomIds[0] as UnitId;
    setHotel(tower, roomId, {
      state,
      stayEndStep: state === 'occupied' ? 99_999 : null,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    });
    const attempt = tryCheckIn(tower, roomId, at(WEDNESDAY, 15));
    expect(attempt.result).toEqual({ checkedIn: false, reason: 'roomNotClean' });
    expect(attempt.state.money).toBe(tower.money);
  });

  it('takes a room again once it is clean', () => {
    const { tower, roomIds } = towerWithRooms(['single-room']);
    const roomId = roomIds[0] as UnitId;
    setHotel(tower, roomId, {
      state: 'dirty',
      stayEndStep: null,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    });
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 15)).result.checkedIn).toBe(false);
    setHotel(tower, roomId, {
      state: 'clean',
      stayEndStep: null,
      checkInStep: null,
      paidRatio: null,
      arrivalStep: null,
      rollDue: false,
      dirtyChecks: 0,
    });
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 15)).result.checkedIn).toBe(true);
  });

  it('throws for a unit that is not a hotel room', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(3, 0, 40),
      units: [{ type: 'office', x: 0, level: 2 }],
    });
    expect(() => checkIn({ state, events: [] }, unitIds[0] as UnitId)).toThrow(/not a hotel room/);
  });
});

describe('hotel check-out time', () => {
  it('draws each stay a check-out time between 07:00 and 10:00 from the room and the check-in step', () => {
    const { tower, roomIds } = towerWithRooms(['single-room', 'double-room', 'suite']);
    const minutes = new Set<number>();
    for (const roomId of roomIds) {
      for (let day = 0; day < 40; day++) {
        const attempt = checkInWithSeed(tower, roomId, at(day, 12 + (day % 10)));
        const end = attempt.state.units[roomId]?.hotel?.stayEndStep as number;
        const minute = (end % STEPS_PER_DAY) / STEPS_PER_MINUTE;
        expect(minute).toBeGreaterThanOrEqual(7 * 60);
        expect(minute).toBeLessThanOrEqual(10 * 60);
        expect(Math.floor(end / STEPS_PER_DAY)).toBe(day + 1);
        minutes.add(minute);
      }
    }
    expect(minutes.size).toBeGreaterThan(30);
  });

  it('draws the same minute for the same room and check-in step and frees the room at it', () => {
    const { tower, roomIds } = towerWithRooms(['single-room']);
    const roomId = roomIds[0] as UnitId;
    const first = checkInWithSeed(tower, roomId, at(WEDNESDAY, 14));
    const second = checkInWithSeed(tower, roomId, at(WEDNESDAY, 14));
    expect(first.state.units[roomId]?.hotel?.stayEndStep).toBe(
      second.state.units[roomId]?.hotel?.stayEndStep,
    );
    const end = first.state.units[roomId]?.hotel?.stayEndStep as number;
    const engine = createEngine({ commandHandlers: {}, systems: [createHotelSystem()] });
    const before = engine.step(first.state, [], end - 1 - first.state.step);
    expect(before.state.units[roomId]?.hotel?.state).toBe('occupied');
    const at10 = engine.step(before.state, [], 1);
    expect(at10.state.units[roomId]?.hotel?.state).toBe('dirty');
    expect(at10.events.some((event) => event.type === 'hotelCheckOut')).toBe(true);
  });
});

describe('hotel stay length', () => {
  it('is one night for every draw and consumes one rng draw', () => {
    const rng = createRng(2024);
    const reference = createRng(2024);
    for (let draw = 0; draw < 200; draw++) {
      expect(drawStayNights(rng)).toBe(1);
      nextInt(reference, 0, 99);
    }
    expect(rng).toEqual(reference);
  });

  it('gives the same draws for the same seed', () => {
    const draws = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 200 }, () => drawStayNights(rng));
    };
    expect(draws(77)).toEqual(draws(77));
    expect(new Set(draws(78))).toEqual(new Set([1]));
  });
});

describe('hotel check-out order', () => {
  it('checks out stays that end at the same step in order of unit id', () => {
    const { tower, roomIds } = towerWithRooms(['single-room', 'double-room']);
    const end = at(WEDNESDAY + 1, 10);
    for (const id of roomIds) {
      setHotel(tower, id, {
        state: 'occupied',
        stayEndStep: end,
        checkInStep: null,
        paidRatio: null,
        arrivalStep: null,
        rollDue: false,
        dirtyChecks: 0,
      });
    }
    tower.step = end - 1;
    const engine = createEngine({ commandHandlers: {}, systems: [createHotelSystem()] });
    const { events } = engine.step(tower, [], 1);
    const checkedOut = events.flatMap((event) =>
      event.type === 'hotelCheckOut' ? [event.unitId] : [],
    );
    expect(checkedOut).toEqual(roomIds);
  });
});

describe('hotel week scenario', () => {
  it('matches the hotel ledger to the nightly prices over 7 days with manual cleaning', () => {
    const { tower, roomIds } = towerWithRooms(['single-room', 'double-room', 'suite']);
    const nightly = [2_000, 3_000, 6_000];
    const engine = createEngine({ commandHandlers: {}, systems: [createHotelSystem()] });
    let state = tower;
    const pending = new Map<string, number>();
    let expected = 0;
    let stays = 0;
    for (let day = 0; day < 8; day++) {
      const noon = at(day, 12);
      const stepped = engine.step(state, [], noon - state.step);
      state = stepped.state;
      for (const event of stepped.events) {
        if (event.type !== 'hotelCheckOut') continue;
        expect(event.paid).toBe(pending.get(event.unitId));
        expected += event.paid;
      }
      if (day === 7) break;
      for (const [index, roomId] of roomIds.entries()) {
        if (state.units[roomId]?.hotel?.state === 'dirty') setHotel(state, roomId, cleanRoom());
        const context: StepContext = { state, events: [] };
        const result = checkIn(context, roomId);
        if (result.checkedIn) {
          pending.set(roomId, result.nights * (nightly[index] as number));
          stays++;
        }
      }
    }
    expect(stays).toBeGreaterThanOrEqual(3);
    expect(state.ledger.currentWeek.hotel.income).toBe(expected);
    expect(state.money - tower.money).toBe(expected);
  });
});

function cleanRoom(): HotelRoom {
  return {
    state: 'clean',
    stayEndStep: null,
    checkInStep: null,
    paidRatio: null,
    arrivalStep: null,
    rollDue: false,
    dirtyChecks: 0,
  };
}
