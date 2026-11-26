import {
  buildEventViews,
  disconnectedUnits,
  findPerson,
  isEvaluatedUnit,
  listPeople,
  NO_TRIP,
  nextStarRequirements,
  populationOf,
  STEPS_PER_DAY,
  DAYS_PER_WEEK,
  isAsleep,
  isCarryingBag,
  outfitOf,
  isOutsideTower,
  isVenueStaffed,
  customersInsideVenue,
  occupantAt,
  routineAt,
  trekPhaseAt,
  type TrekPhase,
  siteAppraisal,
  siteProgress,
} from '@tower-magnate/engine';
import type { PersonView as EnginePerson } from '@tower-magnate/engine';
import {
  ESCALATOR_FLIGHT_STEPS,
  isLevel,
  levelToIndex,
  STAIR_FLIGHT_STEPS,
  LEDGER_CATEGORIES,
  STRESS_SCORE_PINK_FROM,
  STRESS_SCORE_RED_FROM,
  stressScore,
  TOWER_LAYOUT,
  VENUE_STAFF,
  type FinanceSummary,
  type FinanceWeek,
  type CarView,
  type FollowedView,
  type HotelRoomState,
  type LedgerCategory,
  type Level,
  type LevelRow,
  type MoneyReason,
  type Notice,
  type NoticeView,
  type PersonView,
  type Shaft,
  type ShaftView,
  type Snapshot,
  type Transport,
  type TransportView,
  type TowerState,
  type UnitId,
  type UnitView,
  type Viewport,
  type WeekTotals,
  isPricedType,
  priceBand,
} from '@tower-magnate/shared';
import { noticeParamTexts } from './notice-params';

const STEPS_PER_WEEK = STEPS_PER_DAY * DAYS_PER_WEEK;

/** Where each ledger category shows up in the finance window's reasons. */
const REASON_OF_CATEGORY: Record<LedgerCategory, { income: MoneyReason; expense: MoneyReason }> = {
  rent: { income: 'rent', expense: 'rent' },
  hotel: { income: 'hotel', expense: 'hotel' },
  condoSales: { income: 'sale', expense: 'sale' },
  venues: { income: 'dailyPayout', expense: 'dailyPayout' },
  events: { income: 'treasure', expense: 'ransom' },
  construction: { income: 'refund', expense: 'construction' },
  upkeep: { income: 'upkeep', expense: 'upkeep' },
  condoBuybacks: { income: 'condoBuyback', expense: 'condoBuyback' },
  films: { income: 'film', expense: 'film' },
};

/**
 * What a client needs to draw the tower. People are limited to the viewport, and there is no
 * RNG, person queue or routing data. Without a viewport no people are sent.
 */
/** Pass the tower's kept disconnected units; working them out builds a transport graph. */
export function buildSnapshot(
  state: TowerState,
  viewport: Viewport | null,
  disconnected: ReadonlySet<UnitId> = disconnectedUnits(state),
): Snapshot {
  const people = listPeople(state.people);
  const homes = occupiedUnits(people);
  const inside = unitsWithPeopleInside(state, people);
  const sleeping = unitsWithSleepers(state, people);
  const parked = heldSpaces(state);
  const units = [
    ...Object.values(state.units).map((unit) =>
      unitView(
        state,
        unit,
        (homes.has(unit.id) && unit.hotel === null) || isTaken(unit) || parked.has(unit.id),
        disconnected.has(unit.id),
        inside.has(unit.id),
        sleeping.has(unit.id),
      ),
    ),
    ...Object.values(state.sites).map((site) => siteView(state, site, disconnected.has(site.id))),
  ];
  return {
    step: state.step,
    money: state.money,
    stars: state.stars,
    ...(state.starsPending === true ? { starsPending: true as const } : {}),
    population: populationOf(state).total,
    starRequirements: nextStarRequirements(state),
    grid: {
      levels: structureRows(state),
      mainLobbyHeight: state.grid.mainLobbyHeight,
      ...(Object.keys(state.grid.skyLobbyHeights).length > 0
        ? { skyLobbyHeights: skyLobbyHeightsOf(state.grid.skyLobbyHeights) }
        : {}),
    },
    units,
    transports: Object.values(state.transports).map(transportView),
    shafts: Object.values(state.shafts).map(shaftView),
    cars: Object.values(state.shafts).flatMap(carViews),
    people: viewport ? peopleViews(state, people, viewport) : [],
    followed: followedPeople(state),
    activeEvents: buildEventViews(state),
    notices: state.notices.map(noticeView),
    overlays: {
      evaluation: evaluationOverlay(state),
      price: Object.fromEntries(
        units
          .filter((unit) => isPricedType(unit.type))
          .map((unit) => [unit.id, priceBand(unit.price, unit.appraisal ?? unit.price)]),
      ),
      hotel: hotelOverlay(state),
    },
    finances: financeSummary(state),
  };
}

/** The stored grade of every evaluated unit; null shows "Sin evaluar". */
/** The sky lobby heights as a plain record keyed by level. */
function skyLobbyHeightsOf(
  heights: TowerState['grid']['skyLobbyHeights'],
): Record<string, 1 | 2 | 3> {
  const record: Record<string, 1 | 2 | 3> = {};
  for (const [level, height] of Object.entries(heights)) {
    if (height !== undefined) record[level] = height;
  }
  return record;
}

function evaluationOverlay(state: TowerState): Snapshot['overlays']['evaluation'] {
  const grades: Snapshot['overlays']['evaluation'] = {};
  for (const unit of Object.values(state.units)) {
    if (isEvaluatedUnit(unit)) grades[unit.id] = unit.evaluation;
  }
  return grades;
}

/** The state of every hotel room: Limpia, Ocupada, Sucia or Con plaga. */
function hotelOverlay(state: TowerState): Snapshot['overlays']['hotel'] {
  const rooms: Record<string, HotelRoomState> = {};
  for (const unit of Object.values(state.units)) {
    if (unit.hotel) rooms[unit.id] = unit.hotel.state;
  }
  return rooms;
}

type TowerUnit = TowerState['units'][string];

function isListable(type: TowerUnit['type']): boolean {
  return type === 'condo' || type === 'office' || type === 'retail-shop';
}

/** A unit with a tenant, owners or a guest is taken even before anyone of its household is in the tower. */
function isTaken(unit: TowerUnit): boolean {
  return unit.lease !== null || unit.sale !== null || unit.hotel?.state === 'occupied';
}

function unitVariant(
  unit: TowerUnit,
  occupied: boolean,
  disconnected: boolean,
  sleeping: boolean,
): UnitView['variant'] {
  const roomState = unit.hotel?.state;
  if (roomState === 'dirty' || roomState === 'infested') return roomState;
  if (disconnected) return 'disconnected';
  if (sleeping) return 'sleeping';
  return occupied ? 'occupied' : 'empty';
}

function siteView(
  state: TowerState,
  site: TowerState['sites'][string],
  disconnected: boolean,
): UnitView {
  const priced = isPricedType(site.type);
  return {
    id: site.id,
    type: site.type,
    x: site.x,
    level: site.level,
    name: null,
    price: site.price ?? 0,
    ...(priced ? { appraisal: siteAppraisal(state, site) } : {}),
    occupied: false,
    variant: disconnected ? 'disconnected' : 'empty',
    construction: Math.floor(siteProgress(site) * 100),
  };
}

function unitView(
  state: TowerState,
  unit: TowerUnit,
  occupied: boolean,
  disconnected: boolean,
  inside: boolean,
  sleeping: boolean,
): UnitView {
  return {
    id: unit.id,
    type: unit.type,
    x: unit.x,
    level: unit.level,
    name: unit.name,
    price: unit.price,
    ...(isPricedType(unit.type) ? { appraisal: unit.appraisal } : {}),
    ...(unit.lease ? { rent: unit.lease.rent } : {}),
    ...(isListable(unit.type) ? { listed: unit.listed } : {}),
    ...(unit.type === 'fast-food' ? { enabled: unit.enabled } : {}),
    ...(unit.type === 'fast-food' && !unit.activeToday ? { closedToday: true as const } : {}),
    ...(unit.type === 'fast-food' && unit.hours ? { hours: unit.hours } : {}),
    occupied,
    variant: unitVariant(unit, occupied, disconnected, sleeping),
    ...(inside ? { inside } : {}),
    ...(unit.lease !== null ? { leased: true } : {}),
    ...(unit.type in VENUE_STAFF && !isVenueStaffed(state, unit)
      ? { staffed: false as const }
      : {}),
    ...(unit.venue && unit.venue.garbage > 0 ? { garbage: unit.venue.garbage } : {}),
    ...(unit.venue && customersInsideVenue(state, Number(unit.id.slice(1))) > 0
      ? { serving: true as const }
      : {}),
    ...(unit.look !== undefined ? { look: unit.look } : {}),
  };
}

function noticeView(notice: Notice): NoticeView {
  return {
    id: notice.id,
    step: notice.step,
    key: notice.key,
    unitId: notice.unitId,
    params: noticeParamTexts(notice.params),
  };
}

function transportView(transport: Transport): TransportView {
  return { id: transport.id, type: transport.type, x: transport.x, level: transport.level };
}

function shaftView(shaft: Shaft): ShaftView {
  return {
    id: shaft.id,
    type: shaft.type,
    x: shaft.x,
    bottom: shaft.bottom,
    top: shaft.top,
    stops: [...shaft.stops],
  };
}

function carViews(shaft: Shaft): CarView[] {
  return shaft.cars.map((car, index) => ({
    shaftId: shaft.id,
    index,
    position: levelToIndex(car.level),
    direction: 'idle',
    doors: 'closed',
    load: car.riders.length,
  }));
}

/** Parking spaces someone holds: each shows a parked vehicle. */
function heldSpaces(state: TowerState): Set<string> {
  const held = new Set<string>();
  for (const space of Object.values(state.parking.spaces)) {
    if (space > 0) held.add(`u${space}`);
  }
  return held;
}

function occupiedUnits(people: EnginePerson[]): Set<string> {
  const homes = new Set<string>();
  for (const person of people) {
    if (person.homeUnit !== null && person.kind !== 'staff') {
      homes.add(person.homeUnit);
    }
  }
  return homes;
}

/** Units whose home has at least one person asleep in bed, even when another person there is awake. */
function unitsWithSleepers(state: TowerState, people: EnginePerson[]): Set<string> {
  const sleeping = new Set<string>();
  people.forEach((person, slot) => {
    if (person.homeUnit !== null && isAsleep(state.people, slot)) sleeping.add(person.homeUnit);
  });
  return sleeping;
}

/** An idle person standing in a unit that shows as sleeping is not drawn: the unit looks closed. */
function isInSleepingUnit(
  state: TowerState,
  person: EnginePerson,
  sleeping: ReadonlySet<string>,
): boolean {
  const occupant = occupantAt(state.grid, person.level, person.column);
  return occupant?.kind === 'unit' && sleeping.has(occupant.id);
}

/**
 * Units with at least one person standing idle in one of their cells; riders, people outside and
 * walkers passing through excluded. A hotel room only counts its own guests while it is occupied:
 * a maid cleaning it does not turn its light on.
 */
function unitsWithPeopleInside(state: TowerState, people: EnginePerson[]): Set<string> {
  const inside = new Set<string>();
  people.forEach((person, slot) => {
    if (isOutsideTower(state.people, slot) || trekPhaseAt(state.people, slot) !== 'idle') return;
    const occupant = occupantAt(state.grid, person.level, person.column);
    if (occupant?.kind !== 'unit') return;
    const room = state.units[occupant.id]?.hotel;
    if (room && (room.state !== 'occupied' || person.homeUnit !== occupant.id)) return;
    inside.add(occupant.id);
  });
  return inside;
}

function structureRows(state: TowerState): Snapshot['grid']['levels'] {
  const rows: Snapshot['grid']['levels'] = {};
  for (const [level, row] of Object.entries(state.grid.levels)) {
    if (row) {
      rows[level] = { structure: structureString(row) };
    }
  }
  return rows;
}

function structureString(row: LevelRow): string {
  const cells = Array<string>(TOWER_LAYOUT.siteWidthCells).fill('.');
  for (const span of row.structure) {
    const mark = span.kind === 'lobby' ? 'l' : 'f';
    cells.fill(mark, span.x0, span.x1 + 1);
  }
  for (const span of row.occupants) {
    if (span.occupant.kind === 'ruins') {
      cells.fill('r', span.x0, span.x1 + 1);
    }
  }
  return cells.join('');
}

function isInside(person: { level: number; column: number }, viewport: Viewport): boolean {
  return (
    person.level >= viewport.levelFrom &&
    person.level <= viewport.levelTo &&
    person.column >= viewport.xFrom &&
    person.column <= viewport.xTo
  );
}

interface RidePlace {
  carRef: NonNullable<PersonView['carRef']>;
  x: number;
  level: number;
}

function ridePlaces(state: TowerState): Map<string, RidePlace> {
  const places = new Map<string, RidePlace>();
  for (const shaft of Object.values(state.shafts)) {
    shaft.cars.forEach((car, index) => {
      for (const rider of car.riders) {
        places.set(rider, { carRef: { shaftId: shaft.id, index }, x: shaft.x, level: car.level });
      }
    });
  }
  return places;
}

/** An office worker sitting at the desk, at lunch or at the clinic is not walking, even with a plan. */
const RESTING_PHASES: readonly string[] = ['atOffice', 'atLunch', 'atMedical'];

/**
 * True when an idle person stands still at a place of their own: they have no pending trip, sit in
 * a resting office phase, or stand inside a unit. Only then do they show as inside, not walking.
 */
export function standsStill(
  state: TowerState,
  slot: number,
  place: { level: number; column: number },
): boolean {
  if (state.people.trip[slot] === NO_TRIP) return true;
  if (occupantAt(state.grid, place.level, place.column)?.kind === 'unit') return true;
  const phase = routineAt(state.people, slot)?.phase;
  return phase !== undefined && RESTING_PHASES.includes(phase);
}

export function modeOfPhase(phase: TrekPhase, atHome: boolean): PersonView['mode'] {
  switch (phase) {
    case 'idle':
      return atHome ? 'inside' : 'walk';
    case 'onStairs':
    case 'onEscalator':
      return 'stairs';
    case 'queued':
    case 'waitingBesideQueue':
      return 'wait';
    case 'riding':
      return 'ride';
    default:
      return 'walk';
  }
}

function facingOf(state: TowerState, slot: number): PersonView['facing'] {
  return state.people.facing[slot] === 1 ? 'left' : 'right';
}

export function peopleViews(
  state: TowerState,
  people: EnginePerson[],
  viewport: Viewport,
): PersonView[] {
  const rides = ridePlaces(state);
  const views: PersonView[] = [];
  const sleeping = unitsWithSleepers(state, people);
  people.forEach((person, slot) => {
    if (isOutsideTower(state.people, slot) || isAsleep(state.people, slot)) return;
    const phase = trekPhaseAt(state.people, slot);
    if (phase === 'idle' && sleeping.size > 0 && isInSleepingUnit(state, person, sleeping)) return;
    const ride = phase === 'riding' ? rides.get(person.id) : undefined;
    const place = {
      level: ride?.level ?? person.level,
      column: ride?.x ?? person.column,
    };
    if (isInside(place, viewport)) {
      views.push(personView(state, person, slot, phase, place, ride));
    }
  });
  return views;
}

function personView(
  state: TowerState,
  person: EnginePerson,
  slot: number,
  phase: TrekPhase,
  place: { level: number; column: number },
  ride: RidePlace | undefined,
): PersonView {
  return {
    id: person.id,
    kind: person.kind,
    x: place.column,
    level: place.level,
    facing: facingOf(state, slot),
    mode: modeOfPhase(phase, standsStill(state, slot, place)),
    carRef: ride?.carRef ?? null,
    stress: stressLevel(person.stress),
    ...(isCarryingBag(state.people, slot) ? { carrying: true } : {}),
    ...(outfitOf(state.people, slot) === 'uniform' ? { outfit: 'uniform' as const } : {}),
    ...flightOf(state, slot, phase),
  };
}

/** True when the flight from `from` ends on a higher level; a leg with no level counts as up. */
function climbs(from: Level, to: Level): boolean {
  return !isLevel(from) || !isLevel(to) || levelToIndex(to) > levelToIndex(from);
}

/** How far along its flight a person on stairs or an escalator is, for the client to draw. */
export function flightOf(
  state: TowerState,
  slot: number,
  phase: TrekPhase,
): { flight?: PersonView['flight'] } {
  if (phase !== 'onStairs' && phase !== 'onEscalator') return {};
  const steps = phase === 'onStairs' ? STAIR_FLIGHT_STEPS : ESCALATOR_FLIGHT_STEPS;
  const pool = state.people;
  const remaining = (pool.legStep[slot] as number) - state.step;
  return {
    flight: {
      done: Math.min(Math.max(steps - remaining, 0), steps),
      steps,
      up: climbs(pool.level[slot] as Level, pool.legLevel[slot] as Level),
    },
  };
}

/** The tint of a person, from the 0 to 10 score of their stress in steps. */
export function stressLevel(steps: number): PersonView['stress'] {
  const score = stressScore(steps);
  if (score >= STRESS_SCORE_RED_FROM) return 'veryStressed';
  if (score >= STRESS_SCORE_PINK_FROM) return 'stressed';
  return 'normal';
}

function followedPeople(state: TowerState): FollowedView[] {
  const followed: FollowedView[] = [];
  for (const personId of state.people.followed) {
    const person = findPerson(state.people, personId);
    if (person) {
      followed.push({
        id: person.id,
        name: person.name ?? person.id,
        kind: person.kind,
        level: person.level,
        x: person.column,
        stress: stressLevel(person.stress),
      });
    }
  }
  return followed;
}

function financeSummary(state: TowerState): FinanceSummary {
  return weekSummary(state, state.ledger);
}

/** This week and last week of a ledger, the tower's or one unit's, as the finance views send it. */
export function weekSummary(
  state: TowerState,
  ledger: { currentWeek: Partial<WeekTotals>; previousWeek: Partial<WeekTotals> },
): FinanceSummary {
  const weekStartStep = state.step - (state.step % STEPS_PER_WEEK);
  return {
    thisWeek: financeWeek(weekStartStep, ledger.currentWeek),
    lastWeek:
      weekStartStep === 0 ? null : financeWeek(weekStartStep - STEPS_PER_WEEK, ledger.previousWeek),
  };
}

function financeWeek(weekStartStep: number, totals: Partial<WeekTotals>): FinanceWeek {
  const income: FinanceWeek['income'] = {};
  const expenses: FinanceWeek['expenses'] = {};
  for (const category of LEDGER_CATEGORIES) {
    const { income: earned, expense: spent } = totals[category] ?? { income: 0, expense: 0 };
    const reasons = REASON_OF_CATEGORY[category];
    if (earned !== 0) {
      income[reasons.income] = (income[reasons.income] ?? 0) + earned;
    }
    if (spent !== 0) {
      expenses[reasons.expense] = (expenses[reasons.expense] ?? 0) + spent;
    }
  }
  return { weekStartStep, income, expenses };
}
