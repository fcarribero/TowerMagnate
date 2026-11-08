import {
  findPerson,
  listPeople,
  NO_TRIP,
  populationOf,
  STEPS_PER_DAY,
  DAYS_PER_WEEK,
} from '@tower-magnate/engine';
import type { PersonView as EnginePerson } from '@tower-magnate/engine';
import {
  DEFAULT_PRICE_LEVEL,
  LEDGER_CATEGORIES,
  TOWER_LAYOUT,
  type FinanceSummary,
  type FinanceWeek,
  type FollowedView,
  type LedgerCategory,
  type LevelRow,
  type MoneyReason,
  type PersonView,
  type Snapshot,
  type TowerState,
  type UnitView,
  type Viewport,
  type WeekTotals,
} from '@tower-magnate/shared';

const STEPS_PER_WEEK = STEPS_PER_DAY * DAYS_PER_WEEK;
const STRESSED_FROM_MINUTES = 15;
const VERY_STRESSED_FROM_MINUTES = 30;

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
  const units = Object.values(state.units).map((unit) => unitView(unit, homes.has(unit.id)));
  return {
    step: state.step,
    money: state.money,
    stars: 1,
    population: populationOf(state).total,
    grid: {
      levels: structureRows(state),
      mainLobbyHeight: state.grid.mainLobbyHeight,
    },
    units,
    transports: [],
    shafts: [],
    cars: [],
    people: viewport ? people.filter((person) => isInside(person, viewport)).map(personView) : [],
    followed: followedPeople(state),
    activeEvents: [],
    notices: [],
    overlays: {
      evaluation: {},
      price: Object.fromEntries(units.map((unit) => [unit.id, unit.price])),
      hotel: {},
    },
    finances: financeSummary(state),
  };
}

function unitView(unit: TowerState['units'][string], occupied: boolean): UnitView {
  return {
    id: unit.id,
    type: unit.type,
    x: unit.x,
    level: unit.level,
    name: unit.name,
    price: DEFAULT_PRICE_LEVEL,
    occupied,
    variant: occupied ? 'occupied' : 'empty',
  };
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
  return cells.join('');
}

function isInside(person: EnginePerson, viewport: Viewport): boolean {
  return (
    person.level >= viewport.levelFrom &&
    person.level <= viewport.levelTo &&
    person.column >= viewport.xFrom &&
    person.column <= viewport.xTo
  );
}

function personView(person: EnginePerson): PersonView {
  return {
    id: person.id,
    kind: person.kind,
    x: person.column,
    level: person.level,
    facing: 'right',
    mode: person.trip === NO_TRIP ? 'inside' : 'walk',
    carRef: null,
    stress: stressLevel(person.stress),
  };
}

function stressLevel(minutes: number): PersonView['stress'] {
  if (minutes >= VERY_STRESSED_FROM_MINUTES) {
    return 'veryStressed';
  }
  if (minutes >= STRESSED_FROM_MINUTES) {
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
