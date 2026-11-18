import {
  countPeopleOfUnit,
  staffOfUnit,
  evaluationParts,
  occupantScore,
  stressCausesOf,
  findLobby,
  lobbyCells,
  lobbyUpgrades,
  maidsOfUnit,
  visitorsOfUnit,
  peopleOfUnit,
  venuePeople,
  filmAgeDays as engineFilmAgeDays,
  foodVenueSummary,
  housekeepingSummary,
  isOutsideTower,
  newUnit,
  siteAppraisal,
  occupantAt,
  parsePersonId,
  personAt,
  slotOfPerson,
  STEPS_PER_MINUTE,
  trekPhaseAt,
} from '@tower-magnate/engine';
import {
  isPricedType,
  stressScore,
  lobbyUpgradePrice,
  priceBand,
  priceBounds,
  UNIT_CATALOG,
  upgradePrice,
  upgradesOf,
  type InspectData,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';

import { modeOfPhase, standsStill, stressLevel } from './snapshot';

type PersonInspection = Extract<InspectData, { kind: 'person'; status: 'ok' }>;
type ShaftInspection = Extract<InspectData, { kind: 'shaft'; status: 'ok' }>;
type UnitInspection = Extract<InspectData, { kind: 'unit'; status: 'ok' }>;
type UnitDetails = UnitInspection['details'];

/** What the unit window shows for one unit, or a `gone` answer when there is no such unit. */
export function inspectUnit(state: TowerState, unitId: string): InspectData {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  if (!unit) {
    return inspectSite(state, unitId);
  }
  return {
    kind: 'unit',
    id: unit.id,
    status: 'ok',
    name: unit.name,
    type: unit.type,
    level: unit.level,
    from: unit.x,
    to: unit.x + UNIT_CATALOG[unit.type].width - 1,
    details: unitDetails(state, unit),
    upgrades: upgradeViews(unit),
  };
}

/** Every upgrade of the unit's type with its level and what the next level costs. */
function upgradeViews(unit: Unit): UnitInspection['upgrades'] {
  return upgradesOf(unit.type).map((definition) => {
    const level = unit.upgrades?.[definition.id] ?? 0;
    return {
      id: definition.id,
      level,
      maxLevel: definition.maxLevel,
      nextPrice: level < definition.maxLevel ? upgradePrice(unit.type, level) : null,
    };
  });
}

/** A unit still being built shows its name, place and that it is under construction. */
function inspectSite(state: TowerState, siteId: string): InspectData {
  const site = Object.hasOwn(state.sites, siteId) ? state.sites[siteId] : undefined;
  if (!site) {
    return { kind: 'unit', id: siteId, status: 'gone' };
  }
  return {
    kind: 'unit',
    id: site.id,
    status: 'ok',
    name: null,
    type: site.type,
    level: site.level,
    from: site.x,
    to: site.x + UNIT_CATALOG[site.type].width - 1,
    details: siteDetails(state, site),
    upgrades: [],
  };
}

type SiteDetails = Extract<NonNullable<UnitDetails>, { group: 'construction' }>;

/** A priced site shows the price the player chose (or the appraisal it starts at) and the limits. */
function siteDetails(state: TowerState, site: TowerState['sites'][string]): SiteDetails {
  const priority = site.priority === true;
  if (!isPricedType(site.type)) {
    return { group: 'construction', priority };
  }
  const appraisal = siteAppraisal(state, site);
  const price = site.price ?? appraisal;
  const { min, max } = priceBounds(site);
  return {
    group: 'construction',
    price,
    appraisal,
    priceBand: priceBand(price, appraisal),
    priceMin: min,
    priceMax: max,
    priceStep: 1,
    priority,
    ...(site.type === 'condo' || site.type === 'office' || site.type === 'retail-shop'
      ? { listed: site.listed ?? newUnit(site.id, site.type, site.x, site.level).listed }
      : {}),
  };
}

/** What the lobby window shows: the lobby's place and its upgrades, or `gone` when there is no such lobby. */
export function inspectLobby(state: TowerState, lobbyId: string): InspectData {
  const lobby = findLobby(state.grid, lobbyId);
  if (!lobby) {
    return { kind: 'lobby', id: lobbyId, status: 'gone' };
  }
  const levels = lobbyUpgrades(state, lobby);
  const cells = lobbyCells(lobby);
  return {
    kind: 'lobby',
    id: lobby.id,
    status: 'ok',
    level: lobby.level,
    height: lobby.height,
    from: lobby.x0,
    to: lobby.x1,
    upgrades: upgradesOf('lobby').map((definition) => {
      const level = levels[definition.id] ?? 0;
      return {
        id: definition.id,
        level,
        maxLevel: definition.maxLevel,
        nextPrice: level < definition.maxLevel ? lobbyUpgradePrice(cells, level) : null,
      };
    }),
  };
}

/** What the elevator window shows for one shaft, or a `gone` answer when there is no such shaft. */
export function inspectShaft(state: TowerState, shaftId: string): InspectData {
  const shaft = Object.hasOwn(state.shafts, shaftId) ? state.shafts[shaftId] : undefined;
  if (!shaft) {
    return { kind: 'shaft', id: shaftId, status: 'gone' };
  }
  const result: ShaftInspection = {
    kind: 'shaft',
    id: shaft.id,
    status: 'ok',
    type: shaft.type,
    bottom: shaft.bottom,
    top: shaft.top,
    stops: [...shaft.stops],
    cars: shaft.cars.map((car, index) => ({
      index,
      homeLevel: car.homeLevel,
      load: car.riders.length,
    })),
    schedule: shaft.schedule,
    enabled: shaft.disabled !== true,
  };
  return result;
}

function minutesOf<K extends string>(steps: Record<K, number>): Record<K, number> {
  const minutes = {} as Record<K, number>;
  for (const key in steps) minutes[key] = Math.round((steps[key] / STEPS_PER_MINUTE) * 10) / 10;
  return minutes;
}

/** What the person window shows for one person, or a `gone` answer when the person is not in the tower. */
export function inspectPerson(state: TowerState, personId: string): InspectData {
  const pool = state.people;
  const number = parsePersonId(personId);
  const slot = number === null ? -1 : slotOfPerson(pool, number);
  if (slot < 0) {
    return { kind: 'person', id: personId, status: 'gone' };
  }
  const person = personAt(pool, slot);
  const phase = trekPhaseAt(pool, slot);
  const result: PersonInspection = {
    kind: 'person',
    id: person.id,
    status: 'ok',
    name: person.name,
    personKind: person.kind,
    state: personState(state, slot, phase),
    destination: phase === 'idle' ? null : destinationOf(state, slot),
    stressScore: stressScore(person.stress),
    stress: stressLevel(person.stress),
    stressCauses: minutesOf(stressCausesOf(pool, slot)),
    homeUnitId: person.homeUnit,
  };
  return result;
}

function personState(
  state: TowerState,
  slot: number,
  phase: ReturnType<typeof trekPhaseAt>,
): PersonInspection['state'] {
  if (isOutsideTower(state.people, slot)) {
    return 'outside';
  }
  if (phase === 'noRoute') {
    return 'noRoute';
  }
  const place = {
    level: state.people.level[slot] as number,
    column: state.people.column[slot] as number,
  };
  return modeOfPhase(phase, standsStill(state, slot, place));
}

/** The unit the person's trip ends in, or the exit when it ends anywhere else. */
function destinationOf(state: TowerState, slot: number): PersonInspection['destination'] {
  const level = state.people.trekLevel[slot] ?? 0;
  const column = state.people.trekColumn[slot] ?? 0;
  const occupant = occupantAt(state.grid, level, column);
  if (occupant?.kind === 'unit') {
    return { kind: 'unit', unitId: occupant.id, level };
  }
  return { kind: 'exit' };
}

function unitDetails(state: TowerState, unit: Unit): UnitDetails {
  switch (unit.type) {
    case 'office':
    case 'retail-shop':
      return leaseDetails(state, unit);
    case 'condo':
      return condoDetails(state, unit);
    case 'single-room':
    case 'double-room':
    case 'suite':
      return hotelDetails(state, unit);
    case 'cinema':
      return cinemaDetails(state, unit);
    case 'fast-food':
    case 'restaurant':
      return venueDetails(state, unit);
    case 'housekeeping':
      return housekeepingDetails(state, unit);
    case 'security':
      return { group: 'security', officers: staffOfUnit(state, unit, 'police') };
    case 'medical-center':
      return {
        group: 'visit',
        workers: staffOfUnit(state, unit, 'doctor'),
        customers: visitorsOfUnit(state, unit),
      };
    case 'cleaning-room':
      return { group: 'cleaning', workers: staffOfUnit(state, unit, 'cleaner') };
    case 'party-hall':
    case 'cathedral':
      return {
        group: 'visit',
        workers: venuePeople(state, unit).workers,
        customers: visitorsOfUnit(state, unit),
      };
    default:
      return null;
  }
}

function cinemaDetails(state: TowerState, unit: Unit): UnitDetails {
  const filmAgeDays = engineFilmAgeDays(state, unit);
  const people = venuePeople(state, unit);
  return {
    group: 'cinema',
    filmWeek: filmAgeDays === null ? null : Math.floor(filmAgeDays / 7) + 1,
    filmAgeDays,
    workers: people.workers,
    customers: people.customers,
  };
}

function venueDetails(state: TowerState, unit: Unit): UnitDetails {
  const summary = foodVenueSummary(state, unit);
  if (summary === null) return null;
  const people = venuePeople(state, unit);
  const { inside: _outside, ...rest } = summary;
  return {
    group: 'venue',
    ...rest,
    workers: people.workers,
    workersInside: people.workersInside,
    customers: people.customers,
    inside: people.customers.length,
    hours: unit.hours ?? { open: summary.opens, close: summary.closes },
    enabled: unit.enabled,
    activeToday: unit.activeToday,
  };
}

function pricing(state: TowerState, unit: Unit) {
  const { min, max } = priceBounds(unit);
  return {
    price: unit.price,
    appraisal: unit.appraisal,
    priceBand: priceBand(unit.price, unit.appraisal),
    priceMin: min,
    priceMax: max,
    priceStep: 1 as const,
    occupantScore: occupantScore(state, unit),
  };
}

function capacityOf(unit: Unit): number {
  return UNIT_CATALOG[unit.type].capacity?.people ?? 1;
}

function leaseDetails(state: TowerState, unit: Unit): UnitDetails {
  const { lease } = unit;
  return {
    group: 'lease',
    state: lease ? 'occupied' : 'forRent',
    persons: countPeopleOfUnit(state.people, unit.id),
    capacity: capacityOf(unit),
    evaluation: unit.evaluation,
    ...pricing(state, unit),
    listed: unit.listed,
    weeklyRent: lease?.rent ?? null,
    nextPaymentStep: lease?.nextDueStep ?? null,
    workers: peopleOfUnit(state, unit).workers,
    customers: unit.type === 'retail-shop' ? venuePeople(state, unit).customers : [],
    evaluationParts: unitEvaluationParts(state, unit),
  };
}

/** What the unit's grade is made of now, for the reasons in its window. */
function unitEvaluationParts(state: TowerState, unit: Unit) {
  const parts = evaluationParts(state, unit);
  return {
    occupantScore: parts.occupantScore,
    fairPrice: parts.fairPrice,
    noisy: parts.noisy,
    mainCause: parts.mainCause,
    neighborPull: parts.pulledBy !== null,
    parking: parts.parking,
  };
}

function condoDetails(state: TowerState, unit: Unit): UnitDetails {
  return {
    group: 'condo',
    state: unit.sale ? 'sold' : 'forSale',
    residents: peopleOfUnit(state, unit).residents,
    residentCount: countPeopleOfUnit(state.people, unit.id),
    capacity: capacityOf(unit),
    evaluation: unit.evaluation,
    ...pricing(state, unit),
    listed: unit.listed,
    nextEvaluationStep: unit.sale?.nextEvaluationStep ?? null,
    evaluationParts: unitEvaluationParts(state, unit),
  };
}

function hotelDetails(state: TowerState, unit: Unit): UnitDetails {
  const room = unit.hotel;
  const occupied = room?.state === 'occupied';
  return {
    group: 'hotel',
    state: room?.state ?? 'clean',
    guests: countPeopleOfUnit(state.people, unit.id),
    tenants: peopleOfUnit(state, unit).residents,
    capacity: capacityOf(unit),
    evaluation: unit.evaluation,
    ...pricing(state, unit),
    checkoutStep: occupied ? (room?.stayEndStep ?? null) : null,
    evaluationParts: unitEvaluationParts(state, unit),
  };
}

function housekeepingDetails(state: TowerState, unit: Unit): UnitDetails {
  const summary = housekeepingSummary(state, unit.id);
  return {
    group: 'housekeeping',
    maidsWorking: summary.working,
    maids: summary.maids,
    workers: maidsOfUnit(state, unit),
    dirtyRooms: summary.dirtyRooms,
  };
}
