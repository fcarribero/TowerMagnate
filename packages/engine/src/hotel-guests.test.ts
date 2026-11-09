import {
  HOTEL_PARTY_SIZE,
  type HotelRoom,
  type Level,
  type TenantEvaluation,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  decodeGuestRoutine,
  encodeGuestRoutine,
  guestRoutineAt,
  type GuestRoutine,
} from './hotel-guest-trip';
import { createHotelGuests } from './hotel-guests';
import { createRng } from './rng';
import { createScheduler } from './scheduler';
import { createEngine, step, towerSystems, type SimulationSystem } from './step';
import { addFlight, buildTower, plainTowerPlan } from './testing';

const TUESDAY = 1;
const ROOM_TYPES: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

function minuteOf(stepNumber: number): number {
  return Math.floor((stepNumber % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function hotelOf(tower: TowerState, id: UnitId): HotelRoom {
  const hotel = tower.units[id]?.hotel;
  if (!hotel) throw new Error(`${id} is not a hotel room`);
  return hotel;
}

function roomIds(tower: TowerState): UnitId[] {
  return Object.values(tower.units)
    .filter((unit) => unit.hotel !== null)
    .map((unit) => unit.id);
}

const ROOMS_PER_LEVEL = 10;

/** Ten rooms a level from level 2 up, over a lobby, reachable by stairs unless `reachable` is false. */
interface HotelTowerOptions {
  rooms?: number;
  seed?: number;
  reachable?: boolean;
  /** A restaurant and a fast food on level 2, right of the rooms. */
  venues?: boolean;
}

function hotelTower(options: HotelTowerOptions = {}) {
  const rooms = options.rooms ?? 10;
  const units = Array.from({ length: rooms }, (_, index) => ({
    type: ROOM_TYPES[index % ROOM_TYPES.length] as UnitType,
    x: 20 + (index % ROOMS_PER_LEVEL) * 10,
    level: (2 + Math.floor(index / ROOMS_PER_LEVEL)) as Level,
  }));
  if (options.venues) {
    units.push({ type: 'restaurant', x: 150, level: 2 }, { type: 'fast-food', x: 180, level: 2 });
  }
  const levels = 1 + Math.ceil(rooms / ROOMS_PER_LEVEL);
  const { state, unitIds } = buildTower({
    seed: options.seed ?? 1,
    ...plainTowerPlan(levels, 0, options.venues ? 200 : 20 + ROOMS_PER_LEVEL * 10),
    units,
  });
  if (options.reachable !== false) addFlight(state, 'stairs', 4, 1);
  return { state, rooms: unitIds as UnitId[] };
}

const bookingOnly = createEngine({
  commandHandlers: {},
  systems: [createScheduler([createHotelGuests().bookingHook])],
});

/** Runs the 12:00 roll `rounds` times over every room with the given grade, counting bookings. */
function noonRolls(grade: TenantEvaluation | null, rounds: number) {
  let { state } = hotelTower({ rooms: 50, seed: 7 });
  const arrivals: number[] = [];
  let rolls = 0;
  for (let round = 0; round < rounds; round++) {
    for (const id of roomIds(state)) {
      const unit = state.units[id];
      if (!unit) continue;
      unit.evaluation = grade;
      Object.assign(hotelOf(state, id), { arrivalStep: null, rollDue: false });
    }
    state.step = at(TUESDAY + round, 12) - 1;
    state = bookingOnly.step(state, [], 1).state;
    for (const id of roomIds(state)) {
      rolls += 1;
      const arrival = hotelOf(state, id).arrivalStep;
      if (arrival !== null) arrivals.push(arrival);
    }
  }
  return { rolls, arrivals };
}

function share(count: number, total: number): number {
  return (100 * count) / total;
}

describe('hotel booking rolls', () => {
  it.each([
    ['good', 90],
    ['fair', 70],
    ['poor', 40],
    [null, 80],
  ] as const)('books %s rooms within 3 points of %i%%', (grade, percent) => {
    const { rolls, arrivals } = noonRolls(grade, 40);
    expect(rolls).toBe(2000);
    expect(Math.abs(share(arrivals.length, rolls) - percent)).toBeLessThanOrEqual(3);
  });

  it('draws 12:00 arrivals 25/55/20 over 12:00-17:00, 17:00-21:00 and 21:00-22:30', () => {
    const { arrivals } = noonRolls('good', 23);
    const bookings = arrivals.slice(0, 1000);
    expect(bookings).toHaveLength(1000);
    const minutes = bookings.map(minuteOf);
    const early = minutes.filter((minute) => minute >= 12 * 60 && minute < 17 * 60).length;
    const evening = minutes.filter((minute) => minute >= 17 * 60 && minute < 21 * 60).length;
    const late = minutes.filter((minute) => minute >= 21 * 60 && minute < 22 * 60 + 30).length;
    expect(early + evening + late).toBe(1000);
    expect(Math.abs(share(early, 1000) - 25)).toBeLessThanOrEqual(3);
    expect(Math.abs(share(evening, 1000) - 55)).toBeLessThanOrEqual(3);
    expect(Math.abs(share(late, 1000) - 20)).toBeLessThanOrEqual(3);
    expect(bookings.every((arrival) => arrival % STEPS_PER_MINUTE === 0)).toBe(true);
  });

  it('never books a dirty, occupied or infested room, nor one already booked', () => {
    const built = hotelTower({ rooms: 4 });
    let state = built.state;
    const [dirty, occupied, infested, booked] = built.rooms as [UnitId, UnitId, UnitId, UnitId];
    Object.assign(hotelOf(state, dirty), { state: 'dirty' });
    Object.assign(hotelOf(state, occupied), { state: 'occupied', stayEndStep: at(9, 10) });
    Object.assign(hotelOf(state, infested), { state: 'infested' });
    Object.assign(hotelOf(state, booked), { arrivalStep: at(TUESDAY, 20) });
    for (let day = TUESDAY; day < TUESDAY + 30; day++) {
      state.step = at(day, 12) - 1;
      state = bookingOnly.step(state, [], 1).state;
    }
    expect(hotelOf(state, dirty).arrivalStep).toBeNull();
    expect(hotelOf(state, occupied).arrivalStep).toBeNull();
    expect(hotelOf(state, infested).arrivalStep).toBeNull();
    expect(hotelOf(state, booked).arrivalStep).toBe(at(TUESDAY, 20));
  });

  const lateRolls = createEngine({ commandHandlers: {}, systems: [createHotelGuests().system] });

  it('rolls a room that becomes clean at 15:00 at once, arriving in [15:30, 22:30)', () => {
    const minutes: number[] = [];
    for (let seed = 1; minutes.length < 200; seed++) {
      const { state, rooms } = hotelTower({ rooms: 1, seed });
      state.step = at(TUESDAY, 15) - 1;
      const after = lateRolls.step(state, [], 1).state;
      const hotel = hotelOf(after, rooms[0] as UnitId);
      expect(hotel.rollDue).toBe(false);
      if (hotel.arrivalStep !== null) minutes.push(minuteOf(hotel.arrivalStep));
    }
    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(15 * 60 + 30);
    expect(Math.max(...minutes)).toBeLessThan(22 * 60 + 30);
  });

  it('waits for the next 12:00 when the room becomes clean at 21:00 or later', () => {
    const guests = createHotelGuests();
    const rollsOnly = createEngine({
      commandHandlers: {},
      systems: [createScheduler([guests.bookingHook]), guests.system],
    });
    const { state, rooms } = hotelTower({ rooms: 1 });
    const room = rooms[0] as UnitId;
    state.step = at(TUESDAY, 21) - 1;
    const beforeNoon = rollsOnly.step(state, [], at(TUESDAY + 1, 12) - 1 - state.step).state;
    expect(hotelOf(beforeNoon, room)).toMatchObject({ rollDue: true, arrivalStep: null });
    const atNoon = rollsOnly.step(beforeNoon, [], 1).state;
    expect(hotelOf(atNoon, room).rollDue).toBe(false);
  });
});

describe('guest routine encoding', () => {
  it('round-trips every phase with the largest slots and venue', () => {
    const routine: GuestRoutine = { phase: 'leaveRetry', venue: 99_999, slots: [1440, 1440, 1440] };
    expect(decodeGuestRoutine(encodeGuestRoutine(routine))).toEqual(routine);
    const arriving: GuestRoutine = { phase: 'arriving', venue: 0, slots: [0, 0, 0] };
    expect(decodeGuestRoutine(encodeGuestRoutine(arriving))).toEqual(arriving);
  });
});

interface DayLog {
  day: number;
  states: Record<UnitId, HotelRoom['state']>;
}

interface StayWatch {
  /** Check-in steps by room. */
  checkIns: { room: UnitId; step: number }[];
  checkOuts: { room: UnitId; step: number }[];
  /** Steps at which a guest on the check-out day started walking out. */
  departures: number[];
  /** Steps at which a guest appeared at the entrance. */
  arrivals: number[];
  /** Steps at which a guest started each phase. */
  phaseStarts: { phase: GuestRoutine['phase']; step: number }[];
  /** Any step at which a dirty or infested room held a booking. */
  dirtyBookings: number;
  days: DayLog[];
  money: number[];
}

/** Every day at 11:00 a stand-in for the maids cleans every dirty room. */
const cleanAtEleven: SimulationSystem = ({ state }) => {
  if (state.step % STEPS_PER_DAY !== at(0, 11)) return;
  for (const unit of Object.values(state.units)) {
    if (unit.hotel?.state === 'dirty') Object.assign(unit.hotel, { state: 'clean', rollDue: true });
  }
};

function watcher(watch: StayWatch): SimulationSystem {
  let previousIds = new Set<number>();
  const departed = new Set<number>();
  const phases = new Map<number, GuestRoutine['phase']>();
  return ({ state, events }) => {
    for (const event of events.splice(0)) {
      if (event.type === 'hotelCheckIn')
        watch.checkIns.push({ room: event.unitId, step: event.step });
      if (event.type === 'hotelCheckOut')
        watch.checkOuts.push({ room: event.unitId, step: event.step });
    }
    const pool = state.people;
    const ids = new Set<number>();
    for (let slot = 0; slot < pool.id.length; slot++) {
      const routine = guestRoutineAt(pool, slot);
      if (!routine) continue;
      const id = pool.id[slot] as number;
      ids.add(id);
      if (!previousIds.has(id)) watch.arrivals.push(state.step);
      if (phases.get(id) !== routine.phase) {
        phases.set(id, routine.phase);
        watch.phaseStarts.push({ phase: routine.phase, step: state.step });
      }
      if (routine.phase === 'leaving' && !departed.has(id)) {
        departed.add(id);
        watch.departures.push(state.step);
      }
    }
    previousIds = ids;
    for (const unit of Object.values(state.units)) {
      const hotel = unit.hotel;
      if (hotel && hotel.state !== 'clean' && hotel.arrivalStep !== null) watch.dirtyBookings += 1;
    }
    if (state.step % STEPS_PER_DAY === at(0, 23, 30)) {
      const states: Record<UnitId, HotelRoom['state']> = {};
      for (const unit of Object.values(state.units)) {
        if (unit.hotel) states[unit.id] = unit.hotel.state;
      }
      watch.days.push({ day: Math.floor(state.step / STEPS_PER_DAY), states });
      watch.money.push(state.money);
    }
  };
}

function runHotelWeek(tower: TowerState, days: number, cleaning = true) {
  const watch: StayWatch = {
    checkIns: [],
    checkOuts: [],
    departures: [],
    arrivals: [],
    phaseStarts: [],
    dirtyBookings: 0,
    days: [],
    money: [],
  };
  const engine = createEngine({
    commandHandlers: {},
    systems: [...(cleaning ? [cleanAtEleven] : []), ...towerSystems, watcher(watch)],
  });
  const result = engine.runDays(tower, days);
  return { watch, state: result.state };
}

describe('hotel guests over a week', () => {
  const { state: tower } = hotelTower({ rooms: 10, seed: 3 });
  const { watch, state } = runHotelWeek(tower, 7);
  const departureSteps = watch.departures;

  it('checks parties in from 12:00 to 22:30 and never books a dirty room', () => {
    expect(watch.checkIns.length).toBeGreaterThan(10);
    for (const { step: checkIn } of watch.checkIns) {
      expect(minuteOf(checkIn)).toBeGreaterThanOrEqual(12 * 60);
      expect(minuteOf(checkIn)).toBeLessThan(23 * 60);
    }
    for (const arrival of watch.arrivals) {
      expect(minuteOf(arrival)).toBeGreaterThanOrEqual(12 * 60);
      expect(minuteOf(arrival)).toBeLessThan(22 * 60 + 30);
    }
    expect(watch.dirtyBookings).toBe(0);
  });

  it('ends every stay at 10:00 with guests walking out from 06:00 to 10:00', () => {
    expect(watch.checkOuts.length).toBeGreaterThan(5);
    for (const { step: checkOut } of watch.checkOuts) expect(minuteOf(checkOut)).toBe(10 * 60);
    expect(departureSteps.length).toBeGreaterThan(5);
    for (const departure of departureSteps) {
      expect(minuteOf(departure)).toBeGreaterThanOrEqual(6 * 60);
      expect(minuteOf(departure)).toBeLessThan(10 * 60);
    }
  });

  it('files the guests trips of each stay in the room ledger', () => {
    const lastCheckIn = new Map<UnitId, number>();
    for (const { room, step: checkIn } of watch.checkIns) lastCheckIn.set(room, checkIn);
    for (const [room, checkIn] of lastCheckIn) {
      const ledger = state.unitLedger[room] ?? [];
      const ends = ledger.filter((_, index) => index % 2 === 0);
      expect(ends.length).toBeGreaterThan(0);
      expect(ends.every((end) => end >= checkIn)).toBe(true);
      expect(ends).toContain(checkIn);
    }
    const graded = watch.checkOuts.map(({ room }) => state.units[room]?.evaluation ?? null);
    expect(graded.every((grade) => grade !== null)).toBe(true);
  });

  it('holds only the guests of rooms with a stay at the end of the week', () => {
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const routine = guestRoutineAt(pool, slot);
      if (!routine) continue;
      const room = state.units[`u${pool.homeUnit[slot]}`];
      expect(room?.hotel?.stayEndStep ?? null).not.toBeNull();
    }
  });
});

describe('a party with no route to the room', () => {
  it('gives up at 23:00 unpaid, and the room rolls again at 12:00 next day', () => {
    const { state: tower, rooms } = hotelTower({ rooms: 1, reachable: false, seed: 2 });
    const room = rooms[0] as UnitId;
    let state = tower;
    let bookedDay = -1;
    for (let day = 0; day < 5 && bookedDay < 0; day++) {
      state = step(state, [], at(day, 12) + 1 - state.step).state;
      if (hotelOf(state, room).arrivalStep !== null) bookedDay = day;
    }
    expect(bookedDay).toBeGreaterThanOrEqual(0);
    const arrival = hotelOf(state, room).arrivalStep as number;
    state = step(state, [], arrival + 1 - state.step).state;
    const guests = state.people.id.length;
    expect(guests).toBe(HOTEL_PARTY_SIZE['single-room']);
    const money = state.money;

    state = step(state, [], at(bookedDay, 23) - 1 - state.step).state;
    expect(state.people.id).toHaveLength(guests);
    state = step(state, [], 1).state;
    expect(state.people.id).toHaveLength(0);
    expect(hotelOf(state, room)).toMatchObject({
      state: 'clean',
      arrivalStep: null,
      stayEndStep: null,
    });
    expect(state.money).toBe(money);
    expect(state.ledger.currentWeek.hotel.income).toBe(0);

    state = step(state, [], at(bookedDay + 1, 12) - 1 - state.step).state;
    expect(hotelOf(state, room).arrivalStep).toBeNull();
    const rolled = Array.from({ length: 10 }, (_, seed) => {
      const copy = structuredClone(state);
      copy.rng = createRng(seed + 1);
      return step(copy, [], 1).state;
    });
    expect(rolled.some((after) => hotelOf(after, room).arrivalStep !== null)).toBe(true);
  });
});

describe('guest outings', () => {
  const { state: tower } = hotelTower({ rooms: 10, seed: 5, venues: true });
  const { watch, state } = runHotelWeek(tower, 7);
  const startsOf = (phase: GuestRoutine['phase']) =>
    watch.phaseStarts.filter((start) => start.phase === phase).map((start) => minuteOf(start.step));

  it('goes out to eat from 12:30 to 21:30 and the venues count the visits', () => {
    const outings = startsOf('toVenue');
    expect(outings.length).toBeGreaterThan(5);
    for (const minute of outings) {
      expect(minute).toBeGreaterThanOrEqual(12 * 60 + 30);
      expect(minute).toBeLessThan(21 * 60 + 30);
    }
    const visits = Object.values(state.units).reduce(
      (sum, unit) => sum + (unit.venue?.yesterday?.visits ?? 0) + (unit.venue?.visits ?? 0),
      0,
    );
    expect(visits).toBeGreaterThan(0);
  });

  it('leaves for the day from 09:00 to 11:00 and comes back from 16:00 to 20:00', () => {
    const leaves = startsOf('toExit');
    const returns = startsOf('toRoom');
    expect(leaves.length).toBeGreaterThan(3);
    expect(returns.length).toBe(leaves.length);
    for (const minute of leaves) {
      expect(minute).toBeGreaterThanOrEqual(9 * 60);
      expect(minute).toBeLessThan(11 * 60);
    }
    for (const minute of returns) {
      expect(minute).toBeGreaterThanOrEqual(16 * 60);
      expect(minute).toBeLessThan(20 * 60);
    }
  });
});
