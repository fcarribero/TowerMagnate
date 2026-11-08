import {
  CAR_DIRECTIONS,
  CAR_PHASES,
  DWELL_SECONDS_OPTIONS,
  ELEVATOR_BAND_STARTS,
  ELEVATOR_MODES,
  ELEVATOR_QUEUE_CAPACITY,
  HotelRoomStateSchema,
  isLevel,
  PRICE_LEVELS,
  RESPONSE_DISTANCE_MAX,
  RESPONSE_DISTANCE_MIN,
  SHAFT_TYPES,
  UNIT_TYPES,
  type ElevatorCar,
  type CondoSale,
  type HallCall,
  type HotelRoom,
  type Lease,
  type QueueEntry,
  type RiderTrip,
  type RngState,
  type ShaftBand,
  type Level,
  type MedicalDay,
  type ParkingState,
  type Shaft,
  type ShaftSchedule,
  type ShaftType,
  type ShaftId,
  type StopQueues,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitId,
  type VenueDay,
} from '@tower-magnate/shared';
import { defaultSchedule, defaultStops } from '../commands/shafts';
import { STEPS_PER_DAY } from '../clock';
import { SCHEMA_VERSION } from '../state';
import { isHotelRoomType, isVenueType, newHotelRoom, newVenueDay } from '../units';
import { isRecord, StateMigrationError } from './errors';
import { readActiveEvents, readClosedDecisions, readNotices, readTreasureLevels } from './events';
import { readGrid } from './grid';
import { readLedger, readMoney } from './money';
import { readPeople, readTripLedger } from './people';
import { readStars, readWedding } from './stars';
import { readFloorPurchases, readLobbyPurchases, readTransports } from './transports';

export { StateMigrationError } from './errors';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns a version n+1 state into version n+2. */
const MIGRATIONS: readonly Migration[] = [
  addUnitPurchaseRecord,
  addUnitLeaseRecord,
  addShafts,
  addTransportRecord,
  addEventState,
  addPersonPool,
  addStarRating,
  addHallQueues,
  addStarState,
  addHotelRooms,
  addCondoSaleRecord,
  addCarMotion,
  addTrekState,
  addNoticesAndFireLevel,
  addMedicalDay,
  addParkingState,
  addTripLedger,
  addGuardEventState,
  addVenueDayCounts,
  addBombCell,
  addVenueCustomers,
  addTransportPurchaseRecord,
  addWeddingAttempt,
  addLobbyPurchases,
  addUnitEvaluation,
  addHotelBookings,
];

/** Version 2 records each unit's price level, what was paid for it and when it was placed. */
function addUnitPurchaseRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 2 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { priceLevel: 'normal', paid: 0, placedAtStep: 0, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 2, units };
}

/** Version 3 records whether each unit was ever used and its current lease. */
function addUnitLeaseRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 3 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { used: false, lease: null, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 3, units };
}

/** Version 4 keeps elevator shafts in their own record. */
function addShafts(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, schemaVersion: 4, shafts: raw.shafts ?? {} };
}

/** Version 5 records the stairs and escalators; older towers have none. */
function addTransportRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return { transports: {}, ...raw, schemaVersion: 5 };
}

/** Version 6 stores event state: active events, closed decision ids and treasure levels. */
function addEventState(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    schemaVersion: 6,
    activeEvents: raw.activeEvents ?? [],
    closedDecisions: raw.closedDecisions ?? [],
    treasureLevels: raw.treasureLevels ?? [],
  };
}

const EMPTY_VERSION_7_PEOPLE = {
  nextId: 1,
  id: [],
  kind: [],
  homeUnit: [],
  level: [],
  column: [],
  trip: [],
  dueStep: [],
  stress: [],
  nameSeed: [],
  followed: [],
};

/** Version 7 saves the person pool; older saves could only load without people. */
function addPersonPool(raw: Record<string, unknown>): Record<string, unknown> {
  return { people: EMPTY_VERSION_7_PEOPLE, ...raw, schemaVersion: 7 };
}

/** Version 8 records the star rating; older towers start at one star. */
function addStarRating(raw: Record<string, unknown>): Record<string, unknown> {
  return { stars: 1, ...raw, schemaVersion: 8 };
}

/** Version 9 gives every shaft its floor queues; nobody was waiting in older saves. */
function addHallQueues(raw: Record<string, unknown>): Record<string, unknown> {
  const shafts: Record<string, unknown> = {};
  if (isRecord(raw.shafts)) {
    for (const [id, shaft] of Object.entries(raw.shafts)) {
      shafts[id] = isRecord(shaft) ? { queues: {}, ...shaft } : shaft;
    }
  }
  return { ...raw, schemaVersion: 9, shafts };
}

/** Version 10 keeps the star check state. Earlier towers have no VIP approval and no failures. */
function addStarState(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    vipApproved: false,
    lastMedicalFailureStep: null,
    lastParkingFailureStep: null,
    ...raw,
    schemaVersion: 10,
  };
}

/**
 * Version 13 gives each car its motion state and each queued person a destination, and each shaft its stops and band schedule. Older cars
 * stand idle and their riders get off at the next stop; queued people head for the end of the shaft.
 */
function addCarMotion(raw: Record<string, unknown>): Record<string, unknown> {
  const step = isNonNegativeInteger(raw.step) ? raw.step : 0;
  const shafts: Record<string, unknown> = {};
  if (isRecord(raw.shafts)) {
    for (const [id, shaft] of Object.entries(raw.shafts)) {
      shafts[id] = isRecord(shaft) ? withCarMotion(shaft, step) : shaft;
    }
  }
  return { ...raw, schemaVersion: 13, shafts };
}

function withCarMotion(shaft: Record<string, unknown>, step: number): Record<string, unknown> {
  const stops = Array.isArray(shaft.stops) ? shaft.stops : oldShaftStops(shaft);
  const schedule = isRecord(shaft.schedule) ? shaft.schedule : defaultSchedule();
  const cars = Array.isArray(shaft.cars) ? shaft.cars.map((car) => carWithMotion(car, step)) : [];
  const queues: Record<string, unknown> = {};
  if (isRecord(shaft.queues)) {
    for (const [level, stop] of Object.entries(shaft.queues)) {
      queues[level] = isRecord(stop) ? stopWithDestinations(stop, shaft) : stop;
    }
  }
  return { ...shaft, cars, queues, stops, schedule };
}

function oldShaftStops(shaft: Record<string, unknown>): Level[] {
  const range = { x: Number(shaft.x), bottom: shaft.bottom as Level, top: shaft.top as Level };
  const isShaftType = (SHAFT_TYPES as readonly unknown[]).includes(shaft.type);
  if (!isShaftType || !isLevel(range.bottom) || !isLevel(range.top) || range.bottom > range.top) {
    return [];
  }
  return defaultStops(shaft.type as ShaftType, range);
}

function carWithMotion(car: unknown, step: number): unknown {
  if (!isRecord(car)) {
    return car;
  }
  const riders = Array.isArray(car.riders) ? car.riders : [];
  const trips = riders.map(() => ({ destination: car.level, boardedStep: step, waitSteps: 0 }));
  return { trips, phase: 'idle', direction: 'idle', phaseStepsLeft: 0, assigned: [], ...car };
}

function stopWithDestinations(
  stop: Record<string, unknown>,
  shaft: Record<string, unknown>,
): Record<string, unknown> {
  const withDestination = (entries: unknown, destination: unknown): unknown =>
    Array.isArray(entries)
      ? entries.map((entry) => (isRecord(entry) ? { destination, ...entry } : entry))
      : entries;
  return {
    ...stop,
    up: withDestination(stop.up, shaft.top),
    down: withDestination(stop.down, shaft.bottom),
  };
}

/** Version 14 gives each person the state of the trip they are on; nobody is travelling in an older save. */
function addTrekState(raw: Record<string, unknown>): Record<string, unknown> {
  const people = raw.people;
  if (!isRecord(people) || !Array.isArray(people.id)) {
    return { ...raw, schemaVersion: 14 };
  }
  const ids: unknown[] = people.id;
  const idle = (): number[] => ids.map(() => 0);
  const trekFields = {
    trek: idle(),
    trekLevel: idle(),
    trekColumn: idle(),
    trekBudget: idle(),
    legVia: idle(),
    legLevel: idle(),
    legColumn: idle(),
    legStep: idle(),
  };
  return { ...raw, schemaVersion: 14, people: { ...trekFields, ...people } };
}

/** Version 15 keeps the last notices and records the floor of each fire; older fires burn on level 1. */
function addNoticesAndFireLevel(raw: Record<string, unknown>): Record<string, unknown> {
  const activeEvents = Array.isArray(raw.activeEvents)
    ? raw.activeEvents.map((event) =>
        isRecord(event) && event.kind === 'fire' ? { level: 1, ...event } : event,
      )
    : raw.activeEvents;
  return { notices: [], ...raw, activeEvents, schemaVersion: 15 };
}

/** Version 16 counts medical center visits per day; an older save starts with none today. */
function addMedicalDay(raw: Record<string, unknown>): Record<string, unknown> {
  const day = isNonNegativeInteger(raw.step) ? Math.floor(raw.step / STEPS_PER_DAY) : 0;
  return { medicalDay: { day, visits: {}, noticed: [] }, ...raw, schemaVersion: 16 };
}

/** Version 17 stores parking holders; people in an older save have not rolled for a car. */
function addParkingState(raw: Record<string, unknown>): Record<string, unknown> {
  return { parking: { spaces: {}, noticeDay: 0, noticed: [] }, ...raw, schemaVersion: 17 };
}

/** Version 18 keeps the trips each person ended and the stress of the trip in progress; older saves have none. */
function addTripLedger(raw: Record<string, unknown>): Record<string, unknown> {
  const people = raw.people;
  if (!isRecord(people) || !Array.isArray(people.id)) {
    return { tripLedger: {}, ...raw, schemaVersion: 18 };
  }
  const zeros = (): number[] => (people.id as unknown[]).map(() => 0);
  const tripFields = {
    tripSum: zeros(),
    tripSlowFloors: zeros(),
    tripPartStep: zeros(),
    tripPartCut: zeros(),
  };
  return {
    tripLedger: {},
    ...raw,
    people: { ...tripFields, ...people },
    schemaVersion: 18,
  };
}

/** Version 19 gives a bomb threat its search and a fire its burning levels and guards. */
function addGuardEventState(raw: Record<string, unknown>): Record<string, unknown> {
  const activeEvents = Array.isArray(raw.activeEvents)
    ? raw.activeEvents.map((event) => {
        if (!isRecord(event)) return event;
        if (event.kind === 'bomb') return { search: null, ...event };
        if (event.kind === 'fire') return { levels: {}, guards: {}, ...event };
        return event;
      })
    : raw.activeEvents;
  return { ...raw, activeEvents, schemaVersion: 19 };
}

/** Version 20 gives each food and entertainment venue its day counts; older venues start at zero. */
function addVenueDayCounts(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 20 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { venue: venueDayFor(unit.type), ...unit } : unit;
  }
  return { ...raw, schemaVersion: 20, units };
}

function venueDayFor(type: unknown): Record<string, unknown> | null {
  const isVenue = (UNIT_TYPES as readonly unknown[]).includes(type) && isVenueType(type as never);
  return isVenue ? { visits: 0, eveningShowVisits: 0, yesterday: null } : null;
}

/**
 * Version 22 keeps each venue's day count until 00:00, the trip stress of its visits and its
 * outside customers still to come. Retail shops get counts as well.
 */
function addVenueCustomers(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 22 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? withCustomerCounts(unit) : unit;
  }
  return { ...raw, schemaVersion: 22, units };
}

function withCustomerCounts(unit: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(unit.venue)) {
    return { ...unit, venue: { ...newVenueDay(), ...unit.venue } };
  }
  if (unit.type === 'retail-shop') {
    return { ...unit, venue: newVenueDay() };
  }
  return unit;
}

/**
 * Version 21 keeps where a bomb is hidden. A threat saved before that has no cell; it gets the
 * level its search was given, or level 1, which a blast never ruins.
 */
function addBombCell(raw: Record<string, unknown>): Record<string, unknown> {
  const activeEvents = Array.isArray(raw.activeEvents)
    ? raw.activeEvents.map((event) => {
        if (!isRecord(event) || event.kind !== 'bomb') return event;
        const search = isRecord(event.search) ? event.search : null;
        const level = search && isLevel(search.bombLevel) ? search.bombLevel : 1;
        return { bomb: { x: 0, level }, ...event };
      })
    : raw.activeEvents;
  return { ...raw, activeEvents, schemaVersion: 21 };
}

/**
 * Version 23 records what each staircase and escalator cost and when it was placed, and keeps
 * floor tool purchases. Older transports and floor are past the refund window, so they get zero.
 */
function addTransportPurchaseRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const transports = isRecord(raw.transports)
    ? Object.fromEntries(
        Object.entries(raw.transports).map(([id, transport]) => [
          id,
          isRecord(transport) ? { paid: 0, placedAtStep: 0, ...transport } : transport,
        ]),
      )
    : raw.transports;
  return { ...raw, transports, floorPurchases: [], schemaVersion: 23 };
}

/** Version 24 keeps the day's wedding attempt; an older tower has none under way. */
function addWeddingAttempt(raw: Record<string, unknown>): Record<string, unknown> {
  return { wedding: null, ...raw, schemaVersion: 24 };
}

/** Version 25 keeps sky lobby purchases; an older tower's lobbies are past the refund window. */
function addLobbyPurchases(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, lobbyPurchases: [], schemaVersion: 25 };
}

/**
 * Version 26 stores each unit's grade, each evaluated unit's trip ledger and what a hotel stay
 * paid at check-in. Older saves have no grades and no filed trips.
 */
function addUnitEvaluation(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { unitLedger: {}, ...raw, schemaVersion: 26 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? withUnitEvaluation(unit) : unit;
  }
  return { unitLedger: {}, ...raw, schemaVersion: 26, units };
}

function withUnitEvaluation(unit: Record<string, unknown>): Record<string, unknown> {
  const hotel = isRecord(unit.hotel)
    ? { checkInStep: null, paidLevel: null, ...unit.hotel }
    : unit.hotel;
  return { evaluation: null, ...unit, hotel };
}

/**
 * Version 27 keeps each hotel room's booking and whether it rolls for one at once. A room in an
 * older tower has no booking.
 */
function addHotelBookings(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 27 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) && isRecord(unit.hotel) ? withHotelBooking(unit) : unit;
  }
  return { ...raw, schemaVersion: 27, units };
}

function withHotelBooking(unit: Record<string, unknown>): Record<string, unknown> {
  return { ...unit, hotel: { arrivalStep: null, rollDue: false, ...(unit.hotel as object) } };
}

/** Version 11 gives each hotel room a state; every room in an older tower is clean and empty. */
function addHotelRooms(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 11 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { hotel: hotelRoomFor(unit.type), ...unit } : unit;
  }
  return { ...raw, schemaVersion: 11, units };
}

function hotelRoomFor(type: unknown): HotelRoom | null {
  const isRoom =
    (UNIT_TYPES as readonly unknown[]).includes(type) && isHotelRoomType(type as never);
  return isRoom ? newHotelRoom() : null;
}

/** Version 12 records each condo's sale; every condo in an older save is still for sale. */
function addCondoSaleRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 12 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { sale: null, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 12, units };
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRngState(value: unknown): value is RngState {
  return (
    isRecord(value) &&
    isUint32(value.a) &&
    isUint32(value.b) &&
    isUint32(value.c) &&
    isUint32(value.d)
  );
}

function isUnit(value: unknown): value is Unit {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (UNIT_TYPES as readonly unknown[]).includes(value.type) &&
    isNonNegativeInteger(value.x) &&
    isLevel(value.level) &&
    (value.name === null || typeof value.name === 'string') &&
    (PRICE_LEVELS as readonly unknown[]).includes(value.priceLevel) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep) &&
    typeof value.used === 'boolean' &&
    (value.lease === null || isLease(value.lease)) &&
    (value.hotel === null || isHotelRoom(value.hotel)) &&
    (value.sale === null || isCondoSale(value.sale)) &&
    (value.evaluation === null || isTenantEvaluation(value.evaluation)) &&
    (value.venue === null || isVenueDay(value.venue))
  );
}

function isVenueDay(value: unknown): value is VenueDay {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.visits) &&
    isNonNegativeInteger(value.eveningShowVisits) &&
    (value.yesterday === null ||
      (isRecord(value.yesterday) &&
        isNonNegativeInteger(value.yesterday.visits) &&
        (value.yesterday.result === null || Number.isSafeInteger(value.yesterday.result)))) &&
    isNonNegativeInteger(value.countToday) &&
    isNonNegativeInteger(value.previousDayCount) &&
    isNonNegativeInteger(value.stressSum) &&
    isNonNegativeInteger(value.stressTrips) &&
    Array.isArray(value.customers) &&
    value.customers.every(isNonNegativeInteger)
  );
}

function isTenantEvaluation(value: unknown): value is TenantEvaluation {
  return value === 'good' || value === 'fair' || value === 'poor';
}

function isHotelRoom(value: unknown): value is HotelRoom {
  return (
    isRecord(value) &&
    (HotelRoomStateSchema.options as readonly unknown[]).includes(value.state) &&
    (value.stayEndStep === null || isNonNegativeInteger(value.stayEndStep)) &&
    (value.state === 'occupied') === (value.stayEndStep !== null) &&
    (value.checkInStep === null || isNonNegativeInteger(value.checkInStep)) &&
    (value.paidLevel === null || (PRICE_LEVELS as readonly unknown[]).includes(value.paidLevel)) &&
    (value.arrivalStep === null || isNonNegativeInteger(value.arrivalStep)) &&
    typeof value.rollDue === 'boolean'
  );
}

function isCondoSale(value: unknown): value is CondoSale {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.price) &&
    isNonNegativeInteger(value.anchorStep) &&
    isNonNegativeInteger(value.nextEvaluationStep) &&
    value.nextEvaluationStep > value.anchorStep
  );
}

function isLease(value: unknown): value is Lease {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.anchorStep) &&
    isNonNegativeInteger(value.nextDueStep) &&
    value.nextDueStep > value.anchorStep
  );
}

function readUnitLedger(raw: unknown, units: Record<UnitId, Unit>): Record<UnitId, number[]> {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State unit ledger must be a record');
  }
  const ledger: Record<UnitId, number[]> = {};
  for (const [unitId, trips] of Object.entries(raw)) {
    const valid =
      unitId in units &&
      Array.isArray(trips) &&
      trips.length % 2 === 0 &&
      trips.every((value) => Number.isInteger(value));
    if (!valid) {
      throw new StateMigrationError(`State unit ledger entry ${unitId} is malformed`);
    }
    ledger[unitId] = (trips as number[]).slice();
  }
  return ledger;
}

/** Towers saved before units existed have no `units` record; they start with none. */
function readUnits(raw: unknown): Record<UnitId, Unit> {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new StateMigrationError('State units must be a record');
  }
  const units: Record<UnitId, Unit> = {};
  for (const [id, unit] of Object.entries(raw)) {
    if (!isUnit(unit) || unit.id !== id) {
      throw new StateMigrationError(`State unit ${id} is malformed`);
    }
    units[id] = {
      id: unit.id,
      type: unit.type,
      x: unit.x,
      level: unit.level,
      name: unit.name,
      priceLevel: unit.priceLevel,
      paid: unit.paid,
      placedAtStep: unit.placedAtStep,
      used: unit.used,
      lease: unit.lease === null ? null : { ...unit.lease },
      sale: unit.sale === null ? null : { ...unit.sale },
      hotel: unit.hotel === null ? null : { ...unit.hotel },
      evaluation: unit.evaluation,
      venue: readVenueDay(unit.venue),
    };
  }
  return units;
}

function readVenueDay(venue: VenueDay | null): VenueDay | null {
  if (venue === null) {
    return null;
  }
  return {
    ...venue,
    yesterday: venue.yesterday === null ? null : { ...venue.yesterday },
    customers: [...venue.customers],
  };
}

function isElevatorCar(value: unknown): value is ElevatorCar {
  return (
    isRecord(value) &&
    isLevel(value.homeLevel) &&
    isLevel(value.level) &&
    Array.isArray(value.riders) &&
    value.riders.every((rider) => typeof rider === 'string') &&
    Array.isArray(value.trips) &&
    value.trips.length === value.riders.length &&
    value.trips.every(isRiderTrip) &&
    (CAR_PHASES as readonly unknown[]).includes(value.phase) &&
    (CAR_DIRECTIONS as readonly unknown[]).includes(value.direction) &&
    isNonNegativeInteger(value.phaseStepsLeft) &&
    Array.isArray(value.assigned) &&
    value.assigned.every(isHallCall) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

function isRiderTrip(value: unknown): value is RiderTrip {
  return (
    isRecord(value) &&
    isLevel(value.destination) &&
    isNonNegativeInteger(value.boardedStep) &&
    isNonNegativeInteger(value.waitSteps)
  );
}

function isHallCall(value: unknown): value is HallCall {
  return (
    isRecord(value) &&
    isLevel(value.level) &&
    (value.direction === 'up' || value.direction === 'down')
  );
}

function isQueueEntry(value: unknown): value is QueueEntry {
  return (
    isRecord(value) &&
    typeof value.person === 'string' &&
    isLevel(value.destination) &&
    isNonNegativeInteger(value.joinedStep)
  );
}

function isStopQueues(value: unknown): value is StopQueues {
  return (
    isRecord(value) &&
    Array.isArray(value.up) &&
    Array.isArray(value.down) &&
    value.up.length <= ELEVATOR_QUEUE_CAPACITY &&
    value.down.length <= ELEVATOR_QUEUE_CAPACITY &&
    value.up.every(isQueueEntry) &&
    value.down.every(isQueueEntry)
  );
}

function isShaftBand(value: unknown): value is ShaftBand {
  return (
    isRecord(value) &&
    (ELEVATOR_MODES as readonly unknown[]).includes(value.mode) &&
    (DWELL_SECONDS_OPTIONS as readonly unknown[]).includes(value.dwellSeconds) &&
    Number.isInteger(value.responseDistance) &&
    (value.responseDistance as number) >= RESPONSE_DISTANCE_MIN &&
    (value.responseDistance as number) <= RESPONSE_DISTANCE_MAX
  );
}

function isSchedule(value: unknown): value is ShaftSchedule {
  const isDay = (bands: unknown) =>
    Array.isArray(bands) &&
    bands.length === ELEVATOR_BAND_STARTS.length &&
    bands.every(isShaftBand);
  return isRecord(value) && isDay(value.weekday) && isDay(value.weekend);
}

function copyBand(band: ShaftBand): ShaftBand {
  return { ...band };
}

function isShaft(value: unknown): value is Shaft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (SHAFT_TYPES as readonly unknown[]).includes(value.type) &&
    isNonNegativeInteger(value.x) &&
    isLevel(value.bottom) &&
    isLevel(value.top) &&
    value.bottom <= value.top &&
    Array.isArray(value.cars) &&
    value.cars.length > 0 &&
    value.cars.every(isElevatorCar) &&
    Array.isArray(value.stops) &&
    value.stops.every(isLevel) &&
    isSchedule(value.schedule) &&
    isRecord(value.queues) &&
    Object.values(value.queues).every(isStopQueues) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

function copyEntry(entry: QueueEntry): QueueEntry {
  return { person: entry.person, destination: entry.destination, joinedStep: entry.joinedStep };
}

function readShafts(raw: unknown): Record<ShaftId, Shaft> {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State shafts must be a record');
  }
  const shafts: Record<ShaftId, Shaft> = {};
  for (const [id, shaft] of Object.entries(raw)) {
    if (!isShaft(shaft) || shaft.id !== id) {
      throw new StateMigrationError(`State shaft ${id} is malformed`);
    }
    shafts[id] = {
      id: shaft.id,
      type: shaft.type,
      x: shaft.x,
      bottom: shaft.bottom,
      top: shaft.top,
      cars: shaft.cars.map((car) => ({
        homeLevel: car.homeLevel,
        level: car.level,
        riders: [...car.riders],
        trips: car.trips.map((trip) => ({ ...trip })),
        phase: car.phase,
        direction: car.direction,
        phaseStepsLeft: car.phaseStepsLeft,
        assigned: car.assigned.map((call) => ({ ...call })),
        paid: car.paid,
        placedAtStep: car.placedAtStep,
      })),
      stops: [...shaft.stops],
      schedule: {
        weekday: shaft.schedule.weekday.map(copyBand),
        weekend: shaft.schedule.weekend.map(copyBand),
      },
      queues: Object.fromEntries(
        Object.entries(shaft.queues).map(([level, stop]) => [
          level,
          { up: stop.up.map(copyEntry), down: stop.down.map(copyEntry) },
        ]),
      ),
      paid: shaft.paid,
      placedAtStep: shaft.placedAtStep,
    };
  }
  return shafts;
}

function assertCurrentShape(raw: Record<string, unknown>): TowerState {
  if (!isNonNegativeInteger(raw.step)) {
    throw new StateMigrationError('State step must be a non-negative integer');
  }
  if (!isRngState(raw.rng)) {
    throw new StateMigrationError('State rng must hold four unsigned 32-bit words');
  }
  if (!isNonNegativeInteger(raw.nextId)) {
    throw new StateMigrationError('State nextId must be a non-negative integer');
  }
  const people = readPeople(raw.people);
  const units = readUnits(raw.units);
  return {
    schemaVersion: SCHEMA_VERSION,
    step: raw.step,
    rng: { a: raw.rng.a, b: raw.rng.b, c: raw.rng.c, d: raw.rng.d },
    nextId: raw.nextId,
    money: readMoney(raw.money),
    stars: readStars(raw.stars),
    units,
    transports: readTransports(raw.transports),
    shafts: readShafts(raw.shafts),
    grid: readGrid(raw.grid),
    floorPurchases: readFloorPurchases(raw.floorPurchases),
    lobbyPurchases: readLobbyPurchases(raw.lobbyPurchases),
    people: people,
    tripLedger: readTripLedger(raw.tripLedger, people.id),
    unitLedger: readUnitLedger(raw.unitLedger, units),
    ledger: readLedger(raw.ledger),
    activeEvents: readActiveEvents(raw.activeEvents),
    closedDecisions: readClosedDecisions(raw.closedDecisions),
    notices: readNotices(raw.notices),
    treasureLevels: readTreasureLevels(raw.treasureLevels),
    ...readStarState(raw),
    medicalDay: readMedicalDay(raw.medicalDay),
    parking: readParking(raw.parking),
    wedding: readWedding(raw.wedding),
  };
}

type StarState = Pick<
  TowerState,
  'vipApproved' | 'lastMedicalFailureStep' | 'lastParkingFailureStep'
>;

function readStarState(raw: Record<string, unknown>): StarState {
  const { vipApproved, lastMedicalFailureStep, lastParkingFailureStep } = raw;
  if (typeof vipApproved !== 'boolean') {
    throw new StateMigrationError('State vipApproved must be true or false');
  }
  for (const failure of [lastMedicalFailureStep, lastParkingFailureStep]) {
    if (failure !== null && !isNonNegativeInteger(failure)) {
      throw new StateMigrationError('State failure steps must be null or non-negative integers');
    }
  }
  return {
    vipApproved,
    lastMedicalFailureStep: lastMedicalFailureStep as number | null,
    lastParkingFailureStep: lastParkingFailureStep as number | null,
  };
}

function readParking(raw: unknown): ParkingState {
  const fail = (): never => {
    throw new StateMigrationError('State parking must hold holder spaces and notice keys');
  };
  if (!isRecord(raw) || !isRecord(raw.spaces) || !isNonNegativeInteger(raw.noticeDay))
    return fail();
  if (!Array.isArray(raw.noticed) || !raw.noticed.every((key) => typeof key === 'string')) {
    return fail();
  }
  const spaces: Record<number, number> = {};
  for (const [person, space] of Object.entries(raw.spaces)) {
    if (!isNonNegativeInteger(Number(person)) || !isNonNegativeInteger(space)) return fail();
    spaces[Number(person)] = space;
  }
  return { spaces, noticeDay: raw.noticeDay, noticed: [...(raw.noticed as string[])] };
}

function readMedicalDay(raw: unknown): MedicalDay {
  const fail = (): never => {
    throw new StateMigrationError('State medicalDay must hold a day, visit counts and notice keys');
  };
  if (!isRecord(raw) || !isNonNegativeInteger(raw.day) || !isRecord(raw.visits)) return fail();
  if (!Array.isArray(raw.noticed) || !raw.noticed.every((key) => typeof key === 'string')) {
    return fail();
  }
  const visits: Record<number, number> = {};
  for (const [center, count] of Object.entries(raw.visits)) {
    if (!isNonNegativeInteger(Number(center)) || !isNonNegativeInteger(count)) return fail();
    visits[Number(center)] = count;
  }
  return { day: raw.day, visits, noticed: [...(raw.noticed as string[])] };
}

export function migrateState(raw: unknown): TowerState {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State must be an object');
  }
  const version = raw.schemaVersion;
  if (version === undefined) {
    throw new StateMigrationError('State has no schema version');
  }
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new StateMigrationError(`Unknown schema version ${String(version)}`);
  }
  if ((version as number) > SCHEMA_VERSION) {
    throw new StateMigrationError(
      `State schema version ${String(version)} is newer than this engine (${SCHEMA_VERSION})`,
    );
  }
  let migrated = raw;
  for (let from = version as number; from < SCHEMA_VERSION; from++) {
    const migration = MIGRATIONS[from - 1];
    if (!migration) {
      throw new StateMigrationError(`No migration from schema version ${from}`);
    }
    migrated = migration(migrated);
  }
  return assertCurrentShape(migrated);
}
