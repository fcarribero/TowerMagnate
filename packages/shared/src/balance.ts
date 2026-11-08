import type {
  IncomeBracket,
  LimitGroupId,
  PriceLevel,
  PriceTable,
  ShaftType,
  StarRating,
  UnitCost,
  UnitDefinition,
  UnitHeight,
  UnitType,
  UpkeepRule,
} from './units';
import { SHAFT_UNIT_TYPES } from './units';

// Every tunable balance number of the game lives in this module.

export const STARTING_MONEY = 2_000_000;
export const MONEY_CAP = 99_999_999;
export const OFFICE_POPULATION = 6;

export const TOWER_LAYOUT = {
  floorsAboveGround: 100,
  mainLobbyFloor: 1,
  usableBasements: 9,
  subwayTunnelBasement: 10,
  siteWidthCells: 375,
  skyLobbyFloors: [15, 30, 45, 60, 75, 90],
} as const;

/** Population needed to rise from the key's rating to the next one. */
export const STAR_POPULATION_THRESHOLDS: Readonly<Record<Exclude<StarRating, 6>, number>> = {
  1: 300,
  2: 1_000,
  3: 5_000,
  4: 10_000,
  5: 15_000,
};

/** Suites (not infested) a tower needs to reach 4 stars. */
export const SUITES_FOR_FOUR_STARS = 2;

/** People one recycling center covers. */
export const RECYCLING_PEOPLE_PER_CENTER = 2_500;

function fixedHeight(floors: number): UnitHeight {
  return { kind: 'fixed', floors };
}

function perUnit(amount: number): UnitCost {
  return { kind: 'per-unit', amount };
}

export const UNIT_CATALOG: Readonly<Record<UnitType, UnitDefinition>> = {
  floor: {
    type: 'floor',
    name: 'Piso',
    category: 'structure',
    width: 1,
    height: fixedHeight(1),
    cost: { kind: 'per-cell', amount: 500 },
    capacity: null,
    unlockStars: 1,
    placement: { zone: 'any' },
    limitGroup: null,
  },
  lobby: {
    type: 'lobby',
    name: 'Lobby',
    category: 'structure',
    width: 1,
    height: { kind: 'choice', floors: [1, 2, 3] },
    cost: { kind: 'per-cell', amount: 5_000 },
    capacity: null,
    unlockStars: 1,
    placement: { zone: 'lobby-floors' },
    limitGroup: null,
  },
  stairs: {
    type: 'stairs',
    name: 'Escalera',
    category: 'transport',
    width: 8,
    height: fixedHeight(2),
    cost: perUnit(5_000),
    capacity: null,
    unlockStars: 1,
    placement: { zone: 'any' },
    limitGroup: 'stairs-and-escalators',
  },
  escalator: {
    type: 'escalator',
    name: 'Escalera mecánica',
    category: 'transport',
    width: 8,
    height: fixedHeight(2),
    cost: perUnit(20_000),
    capacity: null,
    unlockStars: 1,
    placement: {
      zone: 'any',
      allowedFloorUses: ['lobby', 'commercial', 'entertainment', 'single-room'],
    },
    limitGroup: 'stairs-and-escalators',
  },
  'standard-elevator': {
    type: 'standard-elevator',
    name: 'Ascensor estándar',
    category: 'transport',
    width: 4,
    height: { kind: 'shaft', maxFloorsServed: 30 },
    cost: { kind: 'shaft', shaftAmount: 200_000, perCarAmount: 80_000 },
    capacity: { role: 'passengers-per-car', people: 21 },
    unlockStars: 1,
    placement: {
      zone: 'any',
      elevatorStops: 'any-floor',
      maxCarsPerShaft: 8,
      mustBeSeparatedFromOtherShafts: true,
    },
    limitGroup: 'elevator-shafts',
  },
  office: {
    type: 'office',
    name: 'Oficina',
    category: 'offices-and-housing',
    width: 9,
    height: fixedHeight(1),
    cost: perUnit(40_000),
    capacity: { role: 'office-workers', people: 6 },
    unlockStars: 1,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  condo: {
    type: 'condo',
    name: 'Departamento',
    category: 'offices-and-housing',
    width: 16,
    height: fixedHeight(1),
    cost: perUnit(80_000),
    capacity: { role: 'residents', people: 3 },
    unlockStars: 1,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  'fast-food': {
    type: 'fast-food',
    name: 'Comida rápida',
    category: 'commerce-and-entertainment',
    width: 16,
    height: fixedHeight(1),
    cost: perUnit(100_000),
    capacity: { role: 'customers', people: null },
    unlockStars: 1,
    placement: { zone: 'any' },
    limitGroup: 'commercial',
  },
  'single-room': {
    type: 'single-room',
    name: 'Habitación simple',
    category: 'hotel',
    width: 4,
    height: fixedHeight(1),
    cost: perUnit(20_000),
    capacity: { role: 'hotel-guests', people: 1 },
    unlockStars: 2,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  'double-room': {
    type: 'double-room',
    name: 'Habitación doble',
    category: 'hotel',
    width: 6,
    height: fixedHeight(1),
    cost: perUnit(50_000),
    capacity: { role: 'hotel-guests', people: 2 },
    unlockStars: 2,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  suite: {
    type: 'suite',
    name: 'Suite',
    category: 'hotel',
    width: 10,
    height: fixedHeight(1),
    cost: perUnit(100_000),
    capacity: { role: 'hotel-guests', people: 2 },
    unlockStars: 2,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  housekeeping: {
    type: 'housekeeping',
    name: 'Limpieza',
    category: 'hotel',
    width: 15,
    height: fixedHeight(1),
    cost: perUnit(50_000),
    capacity: { role: 'maids', people: 6 },
    unlockStars: 2,
    placement: { zone: 'any' },
    limitGroup: null,
  },
  security: {
    type: 'security',
    name: 'Seguridad',
    category: 'services',
    width: 16,
    height: fixedHeight(1),
    cost: perUnit(100_000),
    capacity: { role: 'guards', people: 6 },
    unlockStars: 2,
    placement: { zone: 'any' },
    limitGroup: 'security',
  },
  'service-elevator': {
    type: 'service-elevator',
    name: 'Ascensor de servicio',
    category: 'transport',
    width: 4,
    height: { kind: 'shaft', maxFloorsServed: 30 },
    cost: { kind: 'shaft', shaftAmount: 100_000, perCarAmount: 50_000 },
    capacity: { role: 'passengers-per-car', people: 21 },
    unlockStars: 2,
    placement: {
      zone: 'any',
      elevatorStops: 'any-floor',
      maxCarsPerShaft: 8,
      mustBeSeparatedFromOtherShafts: true,
      staffOnly: true,
    },
    limitGroup: 'elevator-shafts',
  },
  restaurant: {
    type: 'restaurant',
    name: 'Restaurante',
    category: 'commerce-and-entertainment',
    width: 24,
    height: fixedHeight(1),
    cost: perUnit(200_000),
    capacity: { role: 'customers', people: null },
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: 'commercial',
  },
  'retail-shop': {
    type: 'retail-shop',
    name: 'Local comercial',
    category: 'commerce-and-entertainment',
    width: 12,
    height: fixedHeight(1),
    cost: perUnit(100_000),
    capacity: { role: 'customers', people: null },
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: 'commercial',
  },
  cinema: {
    type: 'cinema',
    name: 'Cine',
    category: 'commerce-and-entertainment',
    width: 31,
    height: fixedHeight(2),
    cost: perUnit(500_000),
    capacity: { role: 'audience', people: 120 },
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: 'entertainment',
  },
  'party-hall': {
    type: 'party-hall',
    name: 'Salón de fiestas',
    category: 'commerce-and-entertainment',
    width: 24,
    height: fixedHeight(2),
    cost: perUnit(100_000),
    capacity: { role: 'party-guests', people: 50 },
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: 'entertainment',
  },
  'express-elevator': {
    type: 'express-elevator',
    name: 'Ascensor expreso',
    category: 'transport',
    width: 6,
    height: { kind: 'shaft', maxFloorsServed: null },
    cost: { kind: 'shaft', shaftAmount: 400_000, perCarAmount: 150_000 },
    capacity: { role: 'passengers-per-car', people: 42 },
    unlockStars: 3,
    placement: {
      zone: 'any',
      elevatorStops: 'basements-main-and-sky-lobbies',
      maxCarsPerShaft: 8,
      mustBeSeparatedFromOtherShafts: true,
    },
    limitGroup: 'elevator-shafts',
  },
  'medical-center': {
    type: 'medical-center',
    name: 'Centro médico',
    category: 'services',
    width: 26,
    height: fixedHeight(1),
    cost: perUnit(500_000),
    capacity: null,
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: 'medical',
  },
  'parking-ramp': {
    type: 'parking-ramp',
    name: 'Rampa de estacionamiento',
    category: 'services',
    width: 16,
    height: fixedHeight(1),
    cost: perUnit(50_000),
    capacity: null,
    unlockStars: 3,
    placement: { zone: 'basement', alignedWithExistingSameUnit: true },
    limitGroup: null,
  },
  'parking-space': {
    type: 'parking-space',
    name: 'Cochera',
    category: 'services',
    width: 4,
    height: fixedHeight(1),
    cost: perUnit(3_000),
    capacity: null,
    unlockStars: 3,
    placement: { zone: 'basement', mustConnectTo: 'parking-ramp' },
    limitGroup: 'parking',
  },
  'recycling-center': {
    type: 'recycling-center',
    name: 'Centro de reciclaje',
    category: 'services',
    width: 25,
    height: fixedHeight(2),
    cost: perUnit(500_000),
    capacity: null,
    unlockStars: 3,
    placement: { zone: 'basement', mustTouchExistingSameUnit: true },
    limitGroup: null,
  },
  'subway-station': {
    type: 'subway-station',
    name: 'Estación de subte',
    category: 'services',
    width: 30,
    height: fixedHeight(3),
    cost: perUnit(1_000_000),
    capacity: null,
    unlockStars: 4,
    placement: { zone: 'lowest-basement' },
    limitGroup: 'subway',
  },
  cathedral: {
    type: 'cathedral',
    name: 'Catedral',
    category: 'services',
    width: 28,
    height: fixedHeight(4),
    cost: perUnit(3_000_000),
    capacity: { role: 'wedding-guests', people: 40 },
    unlockStars: 5,
    placement: { zone: 'above-top-floor' },
    limitGroup: 'cathedral',
  },
};

export const TOWER_LIMITS: Readonly<Record<LimitGroupId, number>> = {
  'elevator-shafts': 24,
  'stairs-and-escalators': 64,
  security: 10,
  medical: 10,
  entertainment: 16,
  commercial: 512,
  parking: 512,
  subway: 1,
  cathedral: 1,
};

export const DEFAULT_PRICE_LEVEL: PriceLevel = 'normal';

export const LEASE_CONTRACT_WEEKS = 4;
export const CONDO_EVALUATION_WEEKS = 4;

export const WEEKLY_RENT: Readonly<Record<'office' | 'retail-shop', PriceTable>> = {
  office: { high: 15_000, normal: 10_000, low: 5_000, minimum: 2_000 },
  'retail-shop': { high: 20_000, normal: 15_000, low: 10_000, minimum: 4_000 },
};

export const HOTEL_NIGHTLY_PRICE: Readonly<
  Record<'single-room' | 'double-room' | 'suite', PriceTable>
> = {
  'single-room': { high: 3_000, normal: 2_000, low: 1_500, minimum: 500 },
  'double-room': { high: 4_500, normal: 3_000, low: 2_000, minimum: 800 },
  suite: { high: 9_000, normal: 6_000, low: 4_000, minimum: 1_500 },
};

export const HOTEL_STAY_NIGHTS = { min: 1, max: 4 } as const;

/** Percent chance of a stay of 1, 2, 3 and 4 nights. */
export const HOTEL_STAY_NIGHT_WEIGHTS = [40, 30, 20, 10] as const;

export const HOTEL_CHECK_IN_HOURS = { from: 12, until: 23 } as const;
export const HOTEL_CHECK_OUT_HOUR = 10;

export const CONDO_SALE_PRICE: PriceTable = {
  high: 200_000,
  normal: 150_000,
  low: 100_000,
  minimum: 40_000,
};

/** Sorted by minCustomers; the last bracket the count reaches applies. */
export const DAILY_INCOME_BRACKETS: Readonly<
  Record<'fast-food' | 'restaurant' | 'cinema' | 'party-hall', readonly IncomeBracket[]>
> = {
  'fast-food': [
    { minCustomers: 0, amount: -3_000 },
    { minCustomers: 25, amount: 2_000 },
    { minCustomers: 35, amount: 3_000 },
    { minCustomers: 50, amount: 5_000 },
  ],
  restaurant: [
    { minCustomers: 0, amount: -6_000 },
    { minCustomers: 25, amount: 4_000 },
    { minCustomers: 35, amount: 6_000 },
    { minCustomers: 50, amount: 10_000 },
  ],
  cinema: [
    { minCustomers: 0, amount: 0 },
    { minCustomers: 40, amount: 2_000 },
    { minCustomers: 80, amount: 10_000 },
    { minCustomers: 100, amount: 15_000 },
  ],
  'party-hall': [
    { minCustomers: 0, amount: 0 },
    { minCustomers: 25, amount: 5_000 },
    { minCustomers: 40, amount: 10_000 },
  ],
};

export const CINEMA_MOVIE_CHANGE_COST = 300_000;

/** Events spec section 15. One game hour. */
export const DECISION_DEADLINE_STEPS = 360;
export const CLOSED_DECISIONS_KEPT = 20;
export const HELICOPTER_COST = 500_000;

function flatUpkeep(basis: UpkeepRule['basis'], amount: number): UpkeepRule {
  return { basis, amountByStars: [{ minStars: 1, amount }] };
}

/** Charged every Monday at 00:00, economy spec section 8.2. Every unit type has a line. */
export const WEEKLY_UPKEEP: Readonly<Record<UnitType, UpkeepRule>> = {
  floor: flatUpkeep('per-unit', 0),
  lobby: {
    basis: 'per-column',
    amountByStars: [
      { minStars: 1, amount: 0 },
      { minStars: 3, amount: 500 },
      { minStars: 4, amount: 1_500 },
    ],
  },
  stairs: flatUpkeep('per-unit', 0),
  escalator: flatUpkeep('per-unit', 10_000),
  'standard-elevator': flatUpkeep('per-car', 20_000),
  office: flatUpkeep('per-unit', 0),
  condo: flatUpkeep('per-unit', 0),
  'fast-food': flatUpkeep('per-unit', 0),
  'single-room': flatUpkeep('per-unit', 2_000),
  'double-room': flatUpkeep('per-unit', 3_000),
  suite: flatUpkeep('per-unit', 6_000),
  housekeeping: flatUpkeep('per-unit', 20_000),
  security: flatUpkeep('per-unit', 40_000),
  'service-elevator': flatUpkeep('per-car', 20_000),
  restaurant: flatUpkeep('per-unit', 0),
  'retail-shop': flatUpkeep('per-unit', 0),
  cinema: flatUpkeep('per-unit', 0),
  'party-hall': flatUpkeep('per-unit', 20_000),
  'express-elevator': flatUpkeep('per-car', 40_000),
  'medical-center': flatUpkeep('per-unit', 0),
  'parking-ramp': flatUpkeep('per-unit', 20_000),
  'parking-space': flatUpkeep('per-unit', 0),
  'recycling-center': flatUpkeep('per-unit', 100_000),
  'subway-station': flatUpkeep('per-unit', 200_000),
  cathedral: flatUpkeep('per-unit', 0),
};

export const EVAL_PRICE_ADJUST: Readonly<Record<Exclude<PriceLevel, 'minimum'>, number>> = {
  high: 30,
  normal: 0,
  low: -30,
};
export const EVAL_NOISE = 60;

export interface NoiseRule {
  readonly radius: number;
  readonly sources: readonly UnitType[];
}

const COMMERCE_AND_ENTERTAINMENT: readonly UnitType[] = [
  'fast-food',
  'restaurant',
  'retail-shop',
  'cinema',
  'party-hall',
];
const HOTEL_ROOM_NOISE: NoiseRule = {
  radius: 20,
  sources: [...COMMERCE_AND_ENTERTAINMENT, 'office'],
};

/** Noise by evaluated unit type (SE-16): a source on the same level within the radius. */
export const NOISE_RULES: Readonly<Partial<Record<UnitType, NoiseRule>>> = {
  'single-room': HOTEL_ROOM_NOISE,
  'double-room': HOTEL_ROOM_NOISE,
  suite: HOTEL_ROOM_NOISE,
  office: { radius: 10, sources: COMMERCE_AND_ENTERTAINMENT },
  condo: {
    radius: 30,
    sources: [...COMMERCE_AND_ENTERTAINMENT, 'office', 'single-room', 'double-room', 'suite'],
  },
};
export const EVAL_GOOD_BELOW = 90;
export const EVAL_FAIR_BELOW = 180;
export const EVAL_FAIR_BELOW_FROM_FOUR_STARS = 240;

/** People per direction at one stop of an elevator shaft. */
export const ELEVATOR_QUEUE_CAPACITY = 40;
/** Steps a person waits beside a full queue before checking it again (1 game minute). */
export const FULL_QUEUE_RECHECK_STEPS = 6;
/** Added to the route cost of a ride whose queue is full. */
export const FULL_QUEUE_ROUTE_COST = 1_000;

/** Riders a car holds, by shaft type, read from the catalog. */
export function carCapacity(type: ShaftType): number {
  return UNIT_CATALOG[SHAFT_UNIT_TYPES[type]].capacity?.people ?? 0;
}
