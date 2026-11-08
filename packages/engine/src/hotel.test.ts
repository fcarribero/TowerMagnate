import type { EngineEvent, HotelRoom, TowerState, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { stepOfDate, WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { checkIn, createHotelSystem, drawStayNights, type CheckInResult } from './hotel';
import { createRng } from './rng';
import { createEngine, type StepContext } from './step';
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

function seedDrawing(nights: number): number {
  for (let seed = 0; seed < 1_000; seed++) {
    if (drawStayNights(createRng(seed)) === nights) return seed;
  }
  throw new Error(`No seed draws ${nights} nights first`);
}

function checkInForNights(nights: number, tower: TowerState, roomId: UnitId, step: number) {
  const seeded = structuredClone(tower);
  seeded.rng = createRng(seedDrawing(nights));
  return tryCheckIn(seeded, roomId, step);
}

describe('hotel check-in', () => {
  it('credits a 3-night suite stay once and turns it dirty on Saturday at 10:00', () => {
    const { tower, roomIds } = towerWithRooms(['suite']);
    const roomId = roomIds[0] as UnitId;
    const { result, state, events } = checkInForNights(3, tower, roomId, at(WEDNESDAY, 15));

    expect(result).toEqual({ checkedIn: true, nights: 3, paid: 18_000 });
    expect(state.money - tower.money).toBe(18_000);
    expect(state.ledger.currentWeek.hotel.income).toBe(18_000);
    expect(state.units[roomId]?.used).toBe(true);
    expect(state.units[roomId]?.hotel).toEqual({
      state: 'occupied',
      stayEndStep: at(WEDNESDAY + 3, 10),
    });
    expect(weekdayOfDay(WEDNESDAY + 3)).toBe(WEEKDAYS.saturday);
    expect(events.map((event) => event.type)).toEqual(['hotelCheckIn', 'roomStateChanged']);

    const engine = createEngine({ commandHandlers: {}, systems: [createHotelSystem()] });
    const justBefore = engine.step(state, [], at(WEDNESDAY + 3, 10) - 1 - state.step);
    expect(justBefore.state.units[roomId]?.hotel?.state).toBe('occupied');

    const atCheckOut = engine.step(justBefore.state, [], 1);
    expect(atCheckOut.state.step).toBe(at(WEDNESDAY + 3, 10));
    expect(atCheckOut.state.units[roomId]?.hotel).toEqual({ state: 'dirty', stayEndStep: null });
    expect(atCheckOut.events.map((event) => event.type)).toEqual([
      'hotelCheckOut',
      'roomStateChanged',
    ]);
    expect(atCheckOut.state.money).toBe(state.money);
  });

  it.each([
    ['single-room', 'minimum', 500],
    ['double-room', 'low', 2_000],
    ['single-room', 'high', 3_000],
  ] as const)('charges one night in a %s at level %s $%i', (type, priceLevel, price) => {
    const { tower, roomIds } = towerWithRooms([type]);
    const roomId = roomIds[0] as UnitId;
    (tower.units[roomId] as { priceLevel: string }).priceLevel = priceLevel;
    const { result } = checkInForNights(1, tower, roomId, at(WEDNESDAY, 12));
    expect(result).toMatchObject({ checkedIn: true, paid: price });
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
    setHotel(tower, roomId, { state, stayEndStep: state === 'occupied' ? 99_999 : null });
    const attempt = tryCheckIn(tower, roomId, at(WEDNESDAY, 15));
    expect(attempt.result).toEqual({ checkedIn: false, reason: 'roomNotClean' });
    expect(attempt.state.money).toBe(tower.money);
  });

  it('takes a room again once it is clean', () => {
    const { tower, roomIds } = towerWithRooms(['single-room']);
    const roomId = roomIds[0] as UnitId;
    setHotel(tower, roomId, { state: 'dirty', stayEndStep: null });
    expect(tryCheckIn(tower, roomId, at(WEDNESDAY, 15)).result.checkedIn).toBe(false);
    setHotel(tower, roomId, { state: 'clean', stayEndStep: null });
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

describe('hotel stay length', () => {
  it('follows 40/30/20/10 within 2 points over 10,000 seeded draws', () => {
    const rng = createRng(2024);
    const counts = [0, 0, 0, 0];
    const draws = 10_000;
    for (let draw = 0; draw < draws; draw++) {
      const index = drawStayNights(rng) - 1;
      counts[index] = (counts[index] as number) + 1;
    }
    [40, 30, 20, 10].forEach((expected, index) => {
      const percent = ((counts[index] as number) / draws) * 100;
      expect(Math.abs(percent - expected)).toBeLessThan(2);
    });
  });

  it('gives the same draws for the same seed', () => {
    const draws = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 200 }, () => drawStayNights(rng));
    };
    expect(draws(77)).toEqual(draws(77));
    expect(draws(77)).not.toEqual(draws(78));
  });
});

describe('hotel check-out order', () => {
  it('checks out stays that end at the same step in order of unit id', () => {
    const { tower, roomIds } = towerWithRooms(['single-room', 'double-room']);
    const end = at(WEDNESDAY + 1, 10);
    for (const id of roomIds) {
      setHotel(tower, id, { state: 'occupied', stayEndStep: end });
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
    let expected = 0;
    let stays = 0;
    for (let day = 0; day < 7; day++) {
      const noon = at(day, 12);
      state = engine.step(state, [], noon - state.step).state;
      for (const [index, roomId] of roomIds.entries()) {
        if (state.units[roomId]?.hotel?.state === 'dirty') setHotel(state, roomId, cleanRoom());
        const context: StepContext = { state, events: [] };
        const result = checkIn(context, roomId);
        if (result.checkedIn) {
          expected += result.nights * (nightly[index] as number);
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
  return { state: 'clean', stayEndStep: null };
}
