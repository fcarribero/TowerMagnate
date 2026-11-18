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
import { BUILDER_CREW_SIZE, CLEANER_CREW_SIZE } from './people-schedules';
import { SHAFT_UNIT_TYPES } from './units';

// Every tunable balance number of the game lives in this module.

export const STARTING_MONEY = 2_000_000;
export const MONEY_CAP = 99_999_999;
export const OFFICE_POPULATION = 6;
/**
 * Residents a sold condo is counted with when no person of the household exists yet; the real
 * count is the household's people, 1 to CONDO_HOUSEHOLD_SIZES.length (condo households, people.md).
 */
export const CONDO_POPULATION = 3;
/**
 * Weights of a condo household having 1, 2 or 3 people, rolled when the buyer's party is sent. The
 * weights are relative: 20, 40 and 40 give 20% singles, 40% pairs and 40% trios.
 */
export const CONDO_HOUSEHOLD_SIZES = [20, 40, 40] as const;
/** A household of 3 always has exactly one child, so its adults are the other two. */
export const CONDO_TRIO_CHILDREN = 1;
/** Chance that a household of 2 is one adult and one child; otherwise it is two adults. */
export const CONDO_PAIR_CHILD_CHANCE = 0.3;
/** Party size of a hotel stay by room type (stars spec 3.1). */
export const HOTEL_PARTY_SIZE = { 'single-room': 1, 'double-room': 2, suite: 2 } as const;

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

/** Security offices run three 8-hour shifts; each shift has one police officer per spot. */
export const SECURITY_SHIFTS = 3;
export const SECURITY_SHIFT_HOURS = 8;
export const SECURITY_SPOTS = 7;
/** Spots 0 to 2 stay inside the office; the others patrol the floors. */
export const SECURITY_OFFICE_SPOTS = 3;
/** Each level of an office's guards upgrade adds this many officers to every shift; they patrol. */
export const SECURITY_GUARDS_PER_LEVEL = 1;
/**
 * Cameras: a patrolling officer of an office with cameras watches this many columns either side of
 * the cell they stand on, per camera level, on their level. People there feel the noise and dirt
 * stress of the cell times SECURITY_WATCHED_STRESS.
 */
export const SECURITY_CAMERA_COLUMNS = 5;
export const SECURITY_WATCHED_STRESS = 0.5;
/** Each fire system level in the tower (the best office counts) adds this much containment to every fire front a minute. */
export const SECURITY_FIRE_SYSTEM_PROGRESS = 1;
/** Each access control level in the tower (the best office counts) takes this much off the base stress of condos and suites. */
export const SECURITY_ACCESS_CONTROL_SCORE = 30;
/** Police walk at half the speed of everyone else: one column every this many steps. */
export const POLICE_STEPS_PER_COLUMN = 2;
/** A relief starts walking in this long before the shift it takes over begins. */
export const SECURITY_ARRIVAL_LEAD_MINUTES = 120;
/** An officer whose relief has not arrived goes home anyway this long after the shift ends. */
export const SECURITY_RELIEF_GRACE_MINUTES = 120;
/** A patrolling officer stays this many minutes at each stop, drawn from the range. */
export const SECURITY_PATROL_STOP_MINUTES = { min: 3, max: 10 } as const;
/**
 * How much crime each unit type draws, used as the weight of a patrol stop. Busy public places
 * draw the most; condos and the structure, transport and service units draw none, so patrols
 * never stop at them.
 */
export const SECURITY_PATROL_WEIGHTS: Readonly<Record<UnitType, number>> = {
  floor: 0,
  lobby: 0,
  stairs: 0,
  escalator: 0,
  'standard-elevator': 0,
  'service-elevator': 0,
  'express-elevator': 0,
  condo: 0,
  housekeeping: 0,
  security: 0,
  obrador: 0,
  'cleaning-room': 0,
  garden: 0,
  lounge: 0,
  library: 0,
  'recycling-center': 0,
  office: 1,
  'single-room': 1,
  'double-room': 1,
  suite: 1,
  'medical-center': 2,
  cathedral: 2,
  'parking-ramp': 2,
  'parking-space': 2,
  'party-hall': 4,
  'subway-station': 4,
  'fast-food': 6,
  restaurant: 6,
  'retail-shop': 6,
  cinema: 6,
};

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
    width: 4,
    height: fixedHeight(1),
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
    cost: perUnit(150_000),
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
    capacity: { role: 'guards', people: SECURITY_SHIFTS * SECURITY_SPOTS },
    unlockStars: 2,
    placement: { zone: 'any' },
    limitGroup: null,
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
    cost: { kind: 'shaft', shaftAmount: 600_000, perCarAmount: 250_000 },
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
    cost: perUnit(3_000_000),
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
    cost: perUnit(35_000_000),
    capacity: { role: 'wedding-guests', people: 40 },
    unlockStars: 5,
    placement: { zone: 'above-top-floor' },
    limitGroup: 'cathedral',
  },
  obrador: {
    type: 'obrador',
    name: 'Obrador',
    category: 'services',
    width: 15,
    height: fixedHeight(1),
    cost: perUnit(80_000),
    capacity: { role: 'builders', people: BUILDER_CREW_SIZE },
    unlockStars: 1,
    placement: { zone: 'any' },
    limitGroup: null,
  },
  'cleaning-room': {
    type: 'cleaning-room',
    name: 'Cuarto de limpieza',
    category: 'services',
    width: 15,
    height: fixedHeight(1),
    cost: perUnit(60_000),
    capacity: { role: 'cleaners', people: CLEANER_CREW_SIZE },
    unlockStars: 2,
    placement: { zone: 'any' },
    limitGroup: null,
  },
  garden: {
    type: 'garden',
    name: 'Jardín',
    category: 'services',
    width: 12,
    height: fixedHeight(1),
    cost: perUnit(60_000),
    capacity: null,
    unlockStars: 1,
    placement: { zone: 'above-ground' },
    limitGroup: null,
  },
  lounge: {
    type: 'lounge',
    name: 'Sala de estar',
    category: 'services',
    width: 10,
    height: fixedHeight(1),
    cost: perUnit(80_000),
    capacity: null,
    unlockStars: 2,
    placement: { zone: 'any' },
    limitGroup: null,
  },
  library: {
    type: 'library',
    name: 'Biblioteca',
    category: 'services',
    width: 15,
    height: fixedHeight(1),
    cost: perUnit(150_000),
    capacity: null,
    unlockStars: 3,
    placement: { zone: 'any' },
    limitGroup: null,
  },
};

export const TOWER_LIMITS: Readonly<Record<LimitGroupId, number>> = {
  'elevator-shafts': 24,
  'stairs-and-escalators': 64,
  medical: 10,
  entertainment: 16,
  commercial: 512,
  parking: 512,
  subway: 1,
  cathedral: 1,
};

export const DEFAULT_PRICE_LEVEL: PriceLevel = 'normal';

/** A shop with fewer customer visits than this in a lease week leaves at once (economy 4.3). */
export const SHOP_EARLY_LEAVE_MIN_VISITS = 70;
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

export const HOTEL_STAY_NIGHTS = { min: 1, max: 1 } as const;

/** Percent chance of a stay of 1 night: every stay is one night. */
export const HOTEL_STAY_NIGHT_WEIGHTS = [100] as const;

/** Percent chance that a free, clean room is booked at its daily roll, by its stored grade. */
export const HOTEL_BOOKING_CHANCE = {
  good: 90,
  fair: 70,
  poor: 40,
  ungraded: 80,
} as const;

export const HOTEL_CHECK_IN_HOURS = { from: 12, until: 23 } as const;
/** The latest hour a guest can stay in the room; each stay draws its own check-out from 07:00. */
export const HOTEL_CHECK_OUT_HOUR = 10;
export const HOTEL_CHECK_OUT_EARLIEST_HOUR = 7;

export const CONDO_SALE_PRICE: PriceTable = {
  high: 230_000,
  normal: 175_000,
  low: 115_000,
  minimum: 45_000,
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

/** Economy spec 7. Visits count from `opens` until `pays`; the payout lands at the first step of `pays`. */
export const VENUE_PAYOUT_HOURS = {
  'fast-food': { opens: 8, pays: 20 },
  restaurant: { opens: 17, pays: 23 },
  'party-hall': { opens: 13, pays: 17 },
  cinema: { opens: 14, pays: 21 },
} as const;

/** Cinema shows start at these hours and each lasts 2 hours. */
export const CINEMA_SHOW_HOURS = [14, 19] as const;
export const CINEMA_SHOW_LENGTH_HOURS = 2;

export const CINEMA_MOVIE_CHANGE_COST = 300_000;

/** Economy 7.3: the show cap from this film age in days on. Sorted by age. */
export const CINEMA_SHOW_CAPS: readonly { fromAgeDays: number; cap: number }[] = [
  { fromAgeDays: 0, cap: 120 },
  { fromAgeDays: 14, cap: 100 },
  { fromAgeDays: 28, cap: 85 },
  { fromAgeDays: 42, cap: 65 },
  { fromAgeDays: 56, cap: 35 },
];

/** From this film age the cinema asks for a new film, then again every CINEMA_CHANGE_FILM_REPEAT_DAYS. */
export const CINEMA_CHANGE_FILM_FROM_AGE_DAYS = 56;
export const CINEMA_CHANGE_FILM_REPEAT_DAYS = 7;

/** People spec sections 16 and 17. */
export const MEDICAL_VISIT_CHANCE = 0.1;
export const MEDICAL_VISIT_MINUTES = 60;
export const MEDICAL_CENTER_DAILY_VISITS = 100;
export const PARKING_HOLDER_CHANCE = { office: 0.15, condo: 0.25, suite: 0.5 } as const;

/** Events spec section 15. One game hour. */
export const DECISION_DEADLINE_STEPS = 360;
export const CLOSED_DECISIONS_KEPT = 20;
export const NOTICES_KEPT = 50;
export const HELICOPTER_COST = 500_000;
export const SEARCH_COLUMNS_PER_MINUTE = 4;
export const SEARCH_STEPS_PER_MINUTE = 6;
export const FIRE_SPREAD_STEPS = 6;
export const FIRE_FRONT_CONTAINMENT = 10;
export const FIRE_DAILY_ODDS = 84;
export const FIRE_MIN_STARS = 3;
export const FIRE_ROLL_HOUR = 15;
/** A fire can start on a unit whose bottom level has at least this many structure columns. */
export const FIRE_MIN_FLOOR_COLUMNS = 32;
/** The lowest level a fire can start on; it never burns the main lobby floor. */
export const FIRE_LOWEST_LEVEL = 2;
/** A level still burning this many steps after it ignited lights the level above. */
export const FIRE_CLIMB_STEPS = 180;
/** A fire burns out by itself this many steps after it started (19:00). */
export const FIRE_MAX_STEPS = 1_440;
/** Papá Noel crosses the sky once a year at this date and time. */
export const SANTA_TIME = { month: 12, day: 24, hour: 22, minute: 0 } as const;
export const BOMB_DAILY_ODDS = 60;
export const BOMB_MIN_STARS = 2;
export const BOMB_ROLL_HOUR = 9;
export const BOMB_EXPLODE_HOUR = 13;
export const BOMB_BLAST_COLUMNS_LEFT = 20;
export const BOMB_BLAST_COLUMNS_RIGHT = 19;
export const BOMB_BLAST_LEVELS_BELOW = 2;
export const BOMB_BLAST_LEVELS_ABOVE = 3;
/** A VIP visit is rolled at 00:00 only at exactly this rating. */
export const VIP_STARS = 3;
/** Chance in percent of the first roll after a VIP day. */
export const VIP_BASE_PERCENT = 8;
export const VIP_STEP_PERCENT = 4;
/** The roll on this day without a VIP always succeeds. */
export const VIP_GUARANTEE_DAY = 21;
export const VIP_NIGHTS = 1;
/** The visit is approved when the VIP's average trip stress is under this many steps (15 minutes). */
export const VIP_MAX_STRESS_STEPS = 90;

/** The ransom asked when a bomb threat opens, by star rating. */
export function bombRansom(stars: StarRating): number {
  if (stars <= 2) return 200_000;
  if (stars === 3) return 300_000;
  return 1_000_000;
}

/**
 * Commercial units pay upkeep for every hour a day they are open, on top of their flat line:
 * dollars per week for each daily open hour. A venue that is shut all day pays nothing.
 */
export const OPEN_HOUR_WEEKLY_UPKEEP: Readonly<
  Partial<Record<'retail-shop' | 'fast-food' | 'restaurant', number>>
> = {
  'retail-shop': 150,
  'fast-food': 250,
  restaurant: 400,
};

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
      { minStars: 3, amount: 300 },
      { minStars: 4, amount: 1_000 },
    ],
  },
  stairs: flatUpkeep('per-unit', 0),
  escalator: flatUpkeep('per-unit', 5_000),
  'standard-elevator': flatUpkeep('per-car', 10_000),
  office: flatUpkeep('per-unit', 0),
  condo: flatUpkeep('per-unit', 0),
  'fast-food': flatUpkeep('per-unit', 0),
  'single-room': flatUpkeep('per-unit', 2_000),
  'double-room': flatUpkeep('per-unit', 3_000),
  suite: flatUpkeep('per-unit', 10_000),
  housekeeping: flatUpkeep('per-unit', 10_000),
  security: flatUpkeep('per-unit', 20_000),
  'service-elevator': flatUpkeep('per-car', 10_000),
  restaurant: flatUpkeep('per-unit', 0),
  'retail-shop': flatUpkeep('per-unit', 0),
  cinema: flatUpkeep('per-unit', 0),
  'party-hall': flatUpkeep('per-unit', 20_000),
  'express-elevator': flatUpkeep('per-car', 30_000),
  'medical-center': flatUpkeep('per-unit', 0),
  'parking-ramp': flatUpkeep('per-unit', 10_000),
  'parking-space': flatUpkeep('per-unit', 0),
  'recycling-center': flatUpkeep('per-unit', 50_000),
  'subway-station': flatUpkeep('per-unit', 250_000),
  cathedral: flatUpkeep('per-unit', 200_000),
  obrador: flatUpkeep('per-unit', 10_000),
  'cleaning-room': flatUpkeep('per-unit', 10_000),
  garden: flatUpkeep('per-unit', 5_000),
  lounge: flatUpkeep('per-unit', 5_000),
  library: flatUpkeep('per-unit', 10_000),
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
/**
 * Heat maps (docs/design/stress-evaluation.md 2.6). The tower keeps a float per cell for noise and
 * for dirt, and one pair per elevator car. Every game minute an open unit adds its noise to the
 * cells it covers and to HEAT_NOISE_CELLS cells on each side, fading with distance; people add a
 * little each cell they cross and each minute they stand still; bags add dirt around them. Every
 * game minute each noise cell loses a little, so that 5 minutes leave the share given by the decay
 * constant. Dirt stays until something cleans it. Only cells with floor or lobby hold heat.
 */
export const HEAT_NOISE_CELLS = 15;
export const HEAT_BAG_DIRT_CELLS = 5;
/** Share of a cell's noise that stays after 5 game minutes. It is taken off a little every minute. Dirt does not fade. */
export const HEAT_NOISE_DECAY = 0.5;
export const HEAT_DECAY_EVERY_MINUTES = 5;
/** The same decay spread over each minute: five minutes of it multiply to the shares above. */
export const HEAT_NOISE_DECAY_MINUTE = HEAT_NOISE_DECAY ** (1 / HEAT_DECAY_EVERY_MINUTES);
/** Noise a unit adds per game minute to each cell it covers, while it is in use. */
export const UNIT_NOISE: Readonly<Partial<Record<UnitType, number>>> = {
  'fast-food': 2,
  restaurant: 1.5,
  'retail-shop': 1,
  cinema: 3,
  'party-hall': 4,
  office: 0.5,
  condo: 0.08,
  'single-room': 0.05,
  'double-room': 0.08,
  suite: 0.1,
};
/**
 * A construction site is loud: it adds CONSTRUCTION_NOISE per game minute to the cells of every
 * level it covers and CONSTRUCTION_NOISE_ADJACENT to the level above and the level below, with
 * the same 15-cell fade to the sides.
 */
export const CONSTRUCTION_NOISE = 8;
export const CONSTRUCTION_NOISE_ADJACENT = 5;
/** A person adds this much noise to each cell they walk into, and each minute they stand still. */
export const PERSON_NOISE_CELL = 0.02;
export const PERSON_NOISE_STAND_MINUTE = 0.05;
/** A person leaves this much dirt in each cell they walk into. */
export const PERSON_DIRT_CELL = 0.005;
/** A garbage bag, on the floor or carried, adds this much dirt per game minute at its own cell. */
export const BAG_DIRT_MINUTE = 1.5;
/** Elevator cars: noise and dirt per rider that boards, and the extra dirt of a rider with a bag. */
export const CAR_NOISE_RIDER = 0.3;
export const CAR_DIRT_RIDER = 0.1;
/** Game hours for the dirt in an elevator car to fall by half when nobody adds more. */
export const CAR_DIRT_HALF_LIFE_HOURS = 12;
/** What is left of a car's dirt after one game minute. */
export const CAR_DIRT_DECAY_MINUTE = 0.5 ** (1 / (CAR_DIRT_HALF_LIFE_HOURS * 60));
export const CAR_DIRT_BAG = 1;
/**
 * The noise a worker adds to a standard or express car on top of a plain rider, so a worker counts
 * 0.5: people do not like to share a car with builders, cleaners or guards (service units 2.7).
 * Dirt is the same as a plain rider's, more with a bag. Nothing extra on a service car.
 */
export const CAR_NOISE_WORKER = 0.2;
/** Stress steps a person feels per game minute for each point of noise and of dirt in their cell. */
export const NOISE_STRESS_PER_LEVEL = 0.03;
export const DIRT_STRESS_PER_LEVEL = 0.15;
/** Below this stress per minute a cell is calm and gives back 1 step on one minute in CALM_ONE_IN. */
export const CALM_BELOW = 0.1;
export const CALM_ONE_IN = 5;
/** Each column walked outside a unit adds this much stress, in steps. */
export const AMBIENT_WALK_CELL_STRESS = 1;
/** A person sitting still between trips is counted for at most this many steps (2 hours). */
export const AMBIENT_STAY_MAX_STEPS = 720;
export const EVAL_GOOD_BELOW = 90;
export const EVAL_FAIR_BELOW = 180;
export const EVAL_FAIR_BELOW_FROM_FOUR_STARS = 240;

/** Trip stress parts in steps (SE-01 to SE-09). */
export const STRESS_STAIR_FLOOR = 30;
export const STRESS_ESCALATOR_FLOOR = 6;
export const STRESS_QUEUE_FULL = 12;
export const STRESS_NO_ROUTE = 360;
export const STRESS_TRIP_CAP = 540;
/** Wait steps removed from an up ride that boards in a lobby, by lobby height. */
export const STRESS_TALL_LOBBY_CUT: Readonly<Record<number, number>> = { 1: 0, 2: 18, 3: 36 };
/** Extra stress of a trip by its slow floors: the first row whose `from` is reached applies. */
export const STRESS_LONG_TRIP: readonly { from: number; extra: number }[] = [
  { from: 25, extra: 60 },
  { from: 15, extra: 30 },
];

/** Trips that ended within this many steps (one week) count toward a person's stress. */
export const STRESS_WINDOW_STEPS = 60_480;
/** Share of each stress cause a person keeps from one day to the next: about half in 3.5 days. */
export const STRESS_CAUSE_DAILY_KEEP = 0.82;
export const STRESS_ALTO_FROM = 90;
export const STRESS_MUY_ALTO_FROM = 180;
/** Steps of stress that put the 0 to 10 score at 6.3, the scale of `stressScore`. */
export const STRESS_SCORE_SCALE_STEPS = 180;
export const STRESS_SCORE_MAX = 10;
/** Score where people are drawn pink, and red; display only, no rule reads them. */
export const STRESS_SCORE_PINK_FROM = 4;
export const STRESS_SCORE_RED_FROM = 7;
/** A venue loses this share of its customers per point of its visitors' stress score. */
export const VENUE_FACTOR_PER_POINT = 0.04;
/** Venue stress factor by the average trip stress at its door (SE-10). */
export const VENUE_STRESS_FACTOR_NORMAL = 1;
export const VENUE_STRESS_FACTOR_ALTO = 0.8;
export const VENUE_STRESS_FACTOR_MUY_ALTO = 0.6;

/** People per direction at one stop of an elevator shaft. */
export const ELEVATOR_QUEUE_CAPACITY = 40;
/** Steps a person waits beside a full queue before checking it again (1 game minute). */
export const FULL_QUEUE_RECHECK_STEPS = 6;
/** Added to the route cost of a ride whose queue is full. */
export const FULL_QUEUE_ROUTE_COST = 1_000;
/** Rechecks a person waits beside a full queue before they may switch to another ride. */
export const FULL_QUEUE_STAY_RECHECKS = 3;
/** Cost points the new ride must save against the current ride, with its full-queue surcharge. */
export const FULL_QUEUE_SWITCH_MARGIN = 500;
/** Switches a person may make beside full queues in one trip. */
export const FULL_QUEUE_MAX_SWITCHES_PER_TRIP = 2;

/** Route costs per routing.md section 6, in cost points. */
export const ROUTE_FLOOR_COST = 8;
export const ROUTE_ESCALATOR_LEG_COST = 0;
/** One ride costs this much for any number of floors; waiting people add to it (ROUTE_QUEUE_PERSON_COST). */
export const ROUTE_RIDE_COST = 500;
export const ROUTE_STAIR_LEG_COST = 0;
export const ROUTE_TRANSFER_COST = 2_500;
/** Every column walked on a level adds this to the cost of a route. */
export const ROUTE_WALK_COLUMN_COST = 2;
/** Cost of one stair floor for a person of neutral energy (NEUTRAL_ENERGY). */
export const ROUTE_STAIR_FLOOR_COST = 100;
/** Each energy level below neutral adds this to a stair floor, each level above takes it off. */
export const ROUTE_STAIR_ENERGY_STEP = 20;
/** The cheapest a stair floor gets, for the most energetic people. */
export const ROUTE_STAIR_FLOOR_MIN_COST = 10;
/**
 * Maids pay this many times the stair floor cost, so they take the service elevator whenever
 * one serves the floors they need and climb stairs only when it does not.
 */
export const ROUTE_MAID_STAIR_FACTOR = 20;
/**
 * A worker's ride on a service shaft costs this share of a passenger ride, so workers keep to
 * service shafts and take a passenger car only when it is much better (service units 2.6).
 */
export const ROUTE_WORKER_SERVICE_RIDE_FACTOR = 0.25;
/** Added to the cost of a ride for every person already waiting in the queue it starts from. */
export const ROUTE_QUEUE_PERSON_COST = 40;

/** Energy runs from 1 to 10; it is kept in thousandths of a level (people.md energy section). */
export const MIN_ENERGY_LEVEL = 1;
export const MAX_ENERGY_LEVEL = 10;
export const NEUTRAL_ENERGY = 6;
export const ENERGY_UNIT = 1_000;
/** Thousandths of a level lost each step while walking, climbing stairs and waiting in a line. */
export const ENERGY_WALK_DRAIN = 10;
export const ENERGY_STAIRS_DRAIN = 50;
export const ENERGY_WAIT_DRAIN = 60;
/** Thousandths lost each step by a worker inside a unit, and gained by a resident or guest. */
export const ENERGY_WORKER_IDLE_DRAIN = 1;
export const ENERGY_HOME_RESTORE = 8;
/** Levels a resident has less than their own level when they step out of the condo. */
export const ENERGY_RESIDENT_EXIT_LOSS = 2;

/** Movement times per routing.md section 8.1, in steps. */
export const WALK_COLUMNS_PER_STEP = 1;
export const STAIR_FLIGHT_STEPS = 12;
export const ESCALATOR_FLIGHT_STEPS = 6;

/** Limits for one trip (routing section 5.2). */
export const MAX_STAIR_FLOORS_PER_TRIP = 4;
export const MAX_ESCALATOR_FLOORS_PER_TRIP = 7;
export const MAX_RIDES_PER_TRIP = 3;

/** Riders a car holds, by shaft type, read from the catalog. */
export function carCapacity(type: ShaftType): number {
  return UNIT_CATALOG[SHAFT_UNIT_TYPES[type]].capacity?.people ?? 0;
}

/** Floors a car moves in one step, by shaft type (elevators 2.2). */
export const CAR_FLOORS_PER_STEP = { standard: 1, service: 1, express: 3 } as const;
/** Steps a car spends opening its doors at a stop. */
export const DOOR_OPEN_STEPS = 1;
/** Steps a car spends closing its doors before it can leave. */
export const DOOR_CLOSE_STEPS = 1;
/** Dwell choices in game seconds (elevators 14). */
export const DWELL_SECONDS_OPTIONS = [0, 10, 20, 30, 40, 50, 60] as const;
export const DEFAULT_DWELL_SECONDS = 30;
export const RESPONSE_DISTANCE_MIN = 1;
export const RESPONSE_DISTANCE_MAX = 99;
/** How far, in floors, a free car will go to answer a call. */
export const DEFAULT_RESPONSE_DISTANCE = 5;
export const DEFAULT_ELEVATOR_MODE = 'normal';
/** First step of day of each of the 6 bands: 00:00, 07:00, 10:00, 12:00, 14:00, 17:00. */
export const ELEVATOR_BAND_STARTS = [0, 2_520, 3_600, 4_320, 5_040, 6_120] as const;
/** Age in steps at which any free car answers a hall call (5 game minutes). */
export const CALL_PATIENCE_STEPS = 30;

/** Office hours that bound the couriers (people spec 23): offices are open on weekdays, in minutes since midnight. */
export const COURIER_OFFICE_OPEN_MINUTE = 9 * 60;
export const COURIER_OFFICE_CLOSE_MINUTE = 17 * 60;
/** Each office opens and closes up to this many minutes earlier or later than the hours above, a new draw per day. */
export const COURIER_HOURS_JITTER_MINUTES = 30;
/** No courier is sent in the first or the last this many minutes of the office hours. */
export const COURIER_MARGIN_MINUTES = 120;
/** Length in minutes of the block an office rolls once in for a courier. */
export const COURIER_BLOCK_MINUTES = 30;
/** Chance per block that an occupied office with no courier on the way gets one. */
export const COURIER_CHANCE_PER_BLOCK = 0.4;
/** Steps a courier stays at the office door before walking out (30 game seconds). */
export const COURIER_DWELL_STEPS = 3;
/** A courier that has not left this many blocks after being sent gives up and is removed. */
export const COURIER_GIVE_UP_BLOCKS = 3;

/** Player prices run from this to that percent of the unit's base ("normal") table price. */
export const PRICE_BOUNDS_PERCENT = { min: 40, max: 250 } as const;

/** A price within this percent of the appraisal counts as normal; outside it is low or high. */
export const PRICE_BAND_MARGIN_PERCENT = 5;

/** The appraisal never leaves this percent range of the base price. */
export const APPRAISAL_RANGE_PERCENT = { min: 60, max: 160 } as const;


/** Percent added to the appraisal for each star of the tower above the first. */
export const APPRAISAL_STAR_PERCENT = 4;

/** Units that make a tower worth more to live and work in. */
export const APPRAISAL_AMENITY_TYPES: readonly UnitType[] = [
  'retail-shop',
  'fast-food',
  'restaurant',
  'cinema',
  'party-hall',
  'medical-center',
];

/** Percent added per amenity unit in the tower, up to the cap. */
export const APPRAISAL_AMENITY_PERCENT_EACH = 1;
export const APPRAISAL_AMENITY_PERCENT_CAP = 12;

/**
 * Percent the occupants' stress score adds to a unit's fair price: `best` at a score of 0,
 * nothing at `neutralAt`, `worst` at 10, in straight lines between.
 */
export const FAIR_PRICE_STRESS_PERCENT = { best: 30, neutralAt: 3, worst: -50 } as const;

/** Score added to a unit's occupants when a noise source is close by (stress-evaluation 5.4). */
export const EVAL_NOISE_SCORE = 1;

/** A unit grades good from this value (fair price over price), fair from the next one. */
export const GRADE_GOOD_FROM = 1;
export const GRADE_FAIR_FROM = 0.8;
/** From 4 stars a unit stays fair down to this value. */
export const GRADE_FAIR_FROM_FOUR_STARS = 0.7;
/** Share of the gap to its worst neighbor's lower value that a unit's value loses. */
export const NEIGHBOR_PULL = 0.15;

/** Tower score when no trip has been filed yet: the neutral point of the fair price. */
export const TOWER_SCORE_DEFAULT = 3;

/** New office and shop contracts can only start from this hour until the other, exclusive. */
export const LEASE_WINDOW_HOURS = { from: 7, until: 9 } as const;

/** Weekly rent is always charged at this hour, on the weekday the contract started. */
export const LEASE_RENT_HOUR = 7;

/** Minutes between the rolls for office and shop prospects inside the lease window. */
export const LEASE_PROSPECT_ROLL_MINUTES = 15;

/** Weeks of locked rent paid to the tenant when a rented office or shop is demolished. */
export const DEMOLITION_INDEMNITY_WEEKS = 1;

/** A level of an upgrade costs this share of the unit's price, times the level (service-units 5). */
export const UPGRADE_PRICE_SHARE = 0.25;

/**
 * A lobby is priced per cell, so its upgrades count from what its cells cost (every row of every
 * column), and never from less than this (guess).
 */
export const LOBBY_UPGRADE_BASE_PRICE = 200_000;

/** Each plants level takes this share off the stress a person feels in the lobby (service-units 2.4). */
export const LOBBY_PLANTS_STRESS_CUT = 0.15;
/** Each music level takes this share off the noise felt in the lobby. */
export const LOBBY_MUSIC_NOISE_CUT = 0.2;
/** Each lighting level takes this share off the dirt felt in the lobby. */
export const LOBBY_LIGHTING_DIRT_CUT = 0.2;

/**
 * The calm of a garden, a lounge or a library (service-units 3): the stress felt in the unit's own
 * cells is multiplied by `calm`, and the cells beside it on its level get a share that rises in a
 * straight line back to 1 over `cells` columns (guess).
 */
export const COMFORT_AURA: Readonly<Partial<Record<UnitType, { calm: number; cells: number }>>> = {
  garden: { calm: 0.5, cells: 8 },
  lounge: { calm: 0.5, cells: 6 },
  library: { calm: 0.5, cells: 6 },
};

/**
 * Each game minute a library keeps this share of the noise in its own cells, rising back to 1 over
 * the same columns as its calm (guess).
 */
export const LIBRARY_NOISE_KEEP = 0.7;

export interface UpgradeDefinition {
  id: string;
  maxLevel: number;
}

/**
 * The upgrades a unit of each type can buy, level by level. A type that is missing has none.
 * The obrador's upgrades act on its crew (construction.ts, heat.ts), the cleaning room's on its
 * cleaners (cleaning.ts) and the security office's on its officers, fires and grades (police.ts,
 * fire-guards.ts, unit-evaluation.ts). A lobby is not a unit: its upgrades are kept by lobby id in
 * `state.lobbies` and act on what people feel in its cells (lobbies.ts, service-units 2.4).
 */
export const UPGRADE_CATALOG: Partial<Record<UnitType, readonly UpgradeDefinition[]>> = {
  security: [
    { id: 'cameras', maxLevel: 3 },
    { id: 'guards', maxLevel: 3 },
    { id: 'fireSystem', maxLevel: 3 },
    { id: 'accessControl', maxLevel: 2 },
  ],
  obrador: [
    { id: 'tools', maxLevel: 3 },
    { id: 'storage', maxLevel: 3 },
    { id: 'quietEquipment', maxLevel: 3 },
  ],
  'cleaning-room': [
    { id: 'collectionSpeed', maxLevel: 3 },
    { id: 'staff', maxLevel: 3 },
    { id: 'materials', maxLevel: 3 },
    { id: 'tools', maxLevel: 3 },
  ],
  lobby: [
    { id: 'plants', maxLevel: 3 },
    { id: 'music', maxLevel: 3 },
    { id: 'lighting', maxLevel: 3 },
  ],
};

export function upgradesOf(type: UnitType): readonly UpgradeDefinition[] {
  return UPGRADE_CATALOG[type] ?? [];
}

/** The price of the next level of a lobby upgrade, for a lobby of `cells` cells, given the level it has now. */
export function lobbyUpgradePrice(cells: number, level: number): number {
  const lobby = UNIT_CATALOG.lobby.cost;
  const perCell = lobby.kind === 'per-cell' ? lobby.amount : 0;
  const base = Math.max(LOBBY_UPGRADE_BASE_PRICE, perCell * cells);
  return Math.round(base * UPGRADE_PRICE_SHARE * (level + 1));
}

/** The price of the next level of an upgrade, given the level the unit has now. */
export function upgradePrice(type: UnitType, level: number): number {
  const cost = UNIT_CATALOG[type].cost;
  const base = cost.kind === 'per-unit' ? cost.amount : LOBBY_UPGRADE_BASE_PRICE;
  return Math.round(base * UPGRADE_PRICE_SHARE * (level + 1));
}
