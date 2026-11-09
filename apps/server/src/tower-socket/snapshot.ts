import {
  buildEventViews,
  disconnectedUnits,
  findPerson,
  isEvaluatedUnit,
  isExpressStop,
  listPeople,
  NO_TRIP,
  nextStarRequirements,
  populationOf,
  shaftLevels,
  STEPS_PER_DAY,
  DAYS_PER_WEEK,
  trekPhaseAt,
  type TrekPhase,
} from '@tower-magnate/engine';
import type { PersonView as EnginePerson } from '@tower-magnate/engine';
import {
  DEFAULT_PRICE_LEVEL,
  levelToIndex,
  LEDGER_CATEGORIES,
  STRESS_ALTO_FROM,
  STRESS_MUY_ALTO_FROM,
  TOWER_LAYOUT,
  type FinanceSummary,
  type FinanceWeek,
  type CarView,
  type FollowedView,
  type HotelRoomState,
  type LedgerCategory,
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
  type UnitView,
  type Viewport,
  type WeekTotals,
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
export function buildSnapshot(state: TowerState, viewport: Viewport | null): Snapshot {
  const people = listPeople(state.people);
  const homes = occupiedUnits(people);
  const disconnected = disconnectedUnits(state);
  const units = Object.values(state.units).map((unit) =>
    unitView(unit, homes.has(unit.id), disconnected.has(unit.id)),
  );
  return {
    step: state.step,
    money: state.money,
    stars: state.stars,
    population: populationOf(state).total,
    starRequirements: nextStarRequirements(state),
    grid: {
      levels: structureRows(state),
      mainLobbyHeight: state.grid.mainLobbyHeight,
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
      price: Object.fromEntries(units.map((unit) => [unit.id, unit.price])),
      hotel: hotelOverlay(state),
    },
    finances: financeSummary(state),
  };
}

/** The stored grade of every evaluated unit; null shows "Sin evaluar". */
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

function unitVariant(
  unit: TowerUnit,
  occupied: boolean,
  disconnected: boolean,
): UnitView['variant'] {
  const roomState = unit.hotel?.state;
  if (roomState === 'dirty' || roomState === 'infested') return roomState;
  if (disconnected) return 'disconnected';
  return occupied ? 'occupied' : 'empty';
}

function unitView(unit: TowerUnit, occupied: boolean, disconnected: boolean): UnitView {
  return {
    id: unit.id,
    type: unit.type,
    x: unit.x,
    level: unit.level,
    name: unit.name,
    price: DEFAULT_PRICE_LEVEL,
    occupied,
    variant: unitVariant(unit, occupied, disconnected),
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
  const levels = shaftLevels(shaft);
  return {
    id: shaft.id,
    type: shaft.type,
    x: shaft.x,
    bottom: shaft.bottom,
    top: shaft.top,
    stops: shaft.type === 'express' ? levels.filter(isExpressStop) : levels,
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

function occupiedUnits(people: EnginePerson[]): Set<string> {
  const homes = new Set<string>();
  for (const person of people) {
    if (person.homeUnit !== null) {
      homes.add(person.homeUnit);
    }
  }
  return homes;
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

function modeOfPhase(phase: TrekPhase, atHome: boolean): PersonView['mode'] {
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
  people.forEach((person, slot) => {
    const phase = trekPhaseAt(state.people, slot);
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
    mode: modeOfPhase(phase, person.trip === NO_TRIP),
    carRef: ride?.carRef ?? null,
    stress: stressLevel(person.stress),
  };
}

function stressLevel(steps: number): PersonView['stress'] {
  if (steps >= STRESS_MUY_ALTO_FROM) {
    return 'veryStressed';
  }
  if (steps >= STRESS_ALTO_FROM) {
    return 'stressed';
  }
  return 'normal';
}

function followedPeople(state: TowerState): FollowedView[] {
  const followed: FollowedView[] = [];
  for (const personId of state.people.followed) {
    const person = findPerson(state.people, personId);
    if (person) {
      followed.push({
        id: person.id,
        name: person.id,
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
  const weekStartStep = state.step - (state.step % STEPS_PER_WEEK);
  return {
    thisWeek: financeWeek(weekStartStep, state.ledger.currentWeek),
    lastWeek:
      weekStartStep === 0
        ? null
        : financeWeek(weekStartStep - STEPS_PER_WEEK, state.ledger.previousWeek),
  };
}

function financeWeek(weekStartStep: number, totals: WeekTotals): FinanceWeek {
  const income: FinanceWeek['income'] = {};
  const expenses: FinanceWeek['expenses'] = {};
  for (const category of LEDGER_CATEGORIES) {
    const { income: earned, expense: spent } = totals[category];
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
