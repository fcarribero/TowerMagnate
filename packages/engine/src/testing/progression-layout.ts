import { UNIT_CATALOG, type Level, type UnitType } from '@tower-magnate/shared';

/**
 * The tower the progression bot builds: 100 floors over columns 20 to 355, with a transport core
 * in the middle and units on both sides of it. Units are filled from the core outward, so the main
 * lobby and the floors only grow as far as the units need.
 */
export const TOWER_X0 = 20;
export const TOWER_X1 = 355;
export const CORE_X0 = 138;
export const CORE_X1 = 213;
const RIGHT_X0 = CORE_X1 + 1;
const LEFT_X1 = CORE_X0 - 1;

/** Local shaft columns in the order a zone opens them. */
export const LOCAL_SHAFT_COLUMNS = [198, 210, 150, 138] as const;
/** Walkways run from the first local shaft to the units on each side. */
export const WALKWAY_RIGHT_X0 = 202;
export const WALKWAY_LEFT_X1 = 197;
/** Sky lobbies cover the express shafts and the first two local shafts. */
export const SKY_LOBBY_X0 = 170;
export const EXPRESS_SHAFT_COLUMNS = [170, 184] as const;

export const SKY_LOBBIES: readonly Level[] = [15, 30, 45, 60, 75, 90];
export const ZONE_COUNT = 7;
export const TOP_ZONE = 6;
export const CATHEDRAL_X = RIGHT_X0;
export const CATHEDRAL_LEVEL: Level = 101;

/** Basement plan: a ramp stack and parking on S1 to S4, recycling on S6 and S5, subway under it. */
export const PARKING_LEVELS: readonly Level[] = [-1, -2, -3, -4];
export const PARKING_RAMP_X = TOWER_X0;
export const RECYCLING_LEVEL: Level = -6;
export const SUBWAY_X = TOWER_X0;
export const SUBWAY_LEVEL: Level = -9;

/** Lowest and highest level a zone's local shafts serve. */
export function zoneRange(zone: number): { bottom: Level; top: Level } {
  if (zone === 0) return { bottom: 1, top: 14 };
  if (zone === TOP_ZONE) return { bottom: 90, top: CATHEDRAL_LEVEL };
  const bottom = SKY_LOBBIES[zone - 1] as Level;
  return { bottom, top: bottom + 14 };
}

export function zoneOf(level: Level): number {
  if (level < 15) return 0;
  return Math.min(TOP_ZONE, Math.floor(level / 15));
}

export interface Slot {
  type: UnitType;
  x: number;
  level: Level;
}

type FloorUse =
  'offices' | 'condos' | 'fastFood' | 'shops' | 'hotelA' | 'hotelB' | 'services' | 'skyLobby';

const ZONE_ZERO_USES: Readonly<Record<number, FloorUse>> = {
  2: 'offices',
  3: 'condos',
  4: 'services',
  5: 'condos',
  6: 'offices',
  7: 'hotelA',
  8: 'hotelB',
  9: 'shops',
  10: 'condos',
  11: 'offices',
  12: 'condos',
  13: 'condos',
  14: 'offices',
};

/** Uses of the 14 levels above a sky lobby. */
const UPPER_ZONE_USES: readonly FloorUse[] = [
  'offices',
  'condos',
  'fastFood',
  'offices',
  'condos',
  'offices',
  'condos',
  'shops',
  'offices',
  'condos',
  'offices',
  'condos',
  'offices',
  'condos',
];

export function floorUse(level: Level): FloorUse | null {
  if (level < 2 || level > 100) return null;
  if (level < 15) return ZONE_ZERO_USES[level] ?? null;
  const offset = level % 15;
  if (offset === 0) return 'skyLobby';
  return UPPER_ZONE_USES[offset - 1] ?? null;
}

function widthOf(type: UnitType): number {
  return UNIT_CATALOG[type].width;
}

/** Fills one side from the core outward with the given types, repeating the last one. */
function fillSide(
  level: Level,
  side: 'left' | 'right',
  types: readonly UnitType[],
  repeatLast = true,
  skipColumns = 0,
): Slot[] {
  const slots: Slot[] = [];
  const limit = side === 'right' ? TOWER_X1 - RIGHT_X0 + 1 : LEFT_X1 - TOWER_X0 + 1;
  let used = skipColumns;
  let index = 0;
  while (index < types.length || repeatLast) {
    const type = types[Math.min(index, types.length - 1)] as UnitType;
    const width = widthOf(type);
    if (used + width > limit) break;
    const x = side === 'right' ? RIGHT_X0 + used : LEFT_X1 - used - width + 1;
    slots.push({ type, x, level });
    used += width;
    index += 1;
  }
  return slots;
}

function bothSides(level: Level, types: readonly UnitType[], repeatLast = true): Slot[] {
  const right = fillSide(level, 'right', types, repeatLast);
  const left = fillSide(level, 'left', types, repeatLast);
  const slots: Slot[] = [];
  for (let index = 0; index < Math.max(right.length, left.length); index++) {
    const fromRight = right[index];
    const fromLeft = left[index];
    if (fromRight) slots.push(fromRight);
    if (fromLeft) slots.push(fromLeft);
  }
  return slots;
}

/** Hotel rooms: suites nearest the core, then doubles, then singles. */
const HOTEL_ROOMS: readonly UnitType[] = [
  'suite',
  'suite',
  'double-room',
  'double-room',
  'double-room',
  'double-room',
  'single-room',
];

/** Housekeeping and the stair flight to the second hotel level sit next to the core. */
function hotelLevel(level: Level, withStairs: boolean): Slot[] {
  const right: Slot[] = [{ type: 'housekeeping', x: RIGHT_X0, level }];
  const stairsX = RIGHT_X0 + widthOf('housekeeping');
  if (withStairs) right.push({ type: 'stairs', x: stairsX, level });
  const used = widthOf('housekeeping') + widthOf('stairs');
  const rooms = fillSide(level, 'right', HOTEL_ROOMS, true, used);
  const left = fillSide(level, 'left', HOTEL_ROOMS);
  return [...right, ...rooms, ...left];
}

/** Services sit on the right, next to the core, so they never stretch the main lobby. */
function servicesLevel(level: Level, medicalCenters: number): Slot[] {
  const services: UnitType[] = ['security'];
  for (let count = 0; count < medicalCenters; count++) services.push('medical-center');
  const right = fillSide(level, 'right', [...services, 'fast-food']);
  const left = fillSide(level, 'left', ['fast-food']);
  return [...right, ...left];
}

/** Every unit planned for a level above ground, in build order. */
export function levelSlots(level: Level): Slot[] {
  switch (floorUse(level)) {
    case 'offices':
      return bothSides(level, ['office']);
    case 'condos':
      return bothSides(level, ['condo']);
    case 'fastFood':
      return bothSides(level, ['fast-food']);
    case 'shops':
      return bothSides(level, ['restaurant', 'retail-shop']);
    case 'hotelA':
      return hotelLevel(level, true);
    case 'hotelB':
      return hotelLevel(level, false);
    case 'services':
      return servicesLevel(level, 2);
    case 'skyLobby':
      return servicesLevel(level, 3);
    case null:
      return [];
  }
}

/** Service units are built on demand, not in the growth order. */
export const ON_DEMAND_TYPES: ReadonlySet<UnitType> = new Set(['security', 'medical-center']);

/** Columns between the core and the slot's far edge; the right side comes before the left. */
function buildRank(slot: Slot): number {
  if (slot.x > CORE_X1) return slot.x + widthOf(slot.type) - RIGHT_X0;
  return 1_000 + LEFT_X1 - slot.x;
}

/**
 * The growth order of a zone without the on-demand services. The tower grows upward next to the
 * core before it grows outward, because floor is cheap and main lobby is not.
 */
export function growthSlots(zone: number): Slot[] {
  const { bottom, top } = zoneRange(zone);
  const slots: Slot[] = [];
  const last = Math.min(top, 100);
  for (let level = Math.max(bottom, 2); level <= last; level++) {
    slots.push(...levelSlots(level).filter((slot) => !ON_DEMAND_TYPES.has(slot.type)));
  }
  return slots.sort((a, b) => buildRank(a) - buildRank(b) || a.level - b.level);
}

/** Spots for on-demand service units of one type, nearest the ground first. */
export function serviceSlots(type: UnitType): Slot[] {
  const levels: Level[] = [4, ...SKY_LOBBIES];
  const slots: Slot[] = [];
  for (const level of levels) {
    slots.push(...levelSlots(level).filter((slot) => slot.type === type));
  }
  return slots;
}
