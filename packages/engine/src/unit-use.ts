import {
  PERSON_KINDS,
  UNIT_CATALOG,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isVenueOpenNow } from './customers';
import { isAsleep, isOutsideTower } from './outside-tower';
import { isOnTrek } from './trek';
import { unitNumber } from './units';

/** Kinds of people who sleep: their routines can say so. */
const SLEEPER_KINDS: ReadonlySet<number> = new Set(
  (['resident', 'child', 'hotelGuest', 'vip'] as const).map((kind) => PERSON_KINDS.indexOf(kind)),
);

/** A person standing still adds a little noise to their cell each minute, unless asleep. */
export function makesStandNoise(pool: PersonPool, slot: number): boolean {
  return !SLEEPER_KINDS.has(pool.kind[slot] as number) || !isAsleep(pool, slot);
}

/** Sold condos and occupied hotel rooms by unit number: the homes that can be in use. */
function livedInHomes(state: TowerState): Map<number, Unit> {
  const homes = new Map<number, Unit>();
  for (const unit of Object.values(state.units)) {
    const lived = unit.type === 'condo' ? unit.sale !== null : unit.hotel?.state === 'occupied';
    if (lived) homes.set(unitNumber(unit.id), unit);
  }
  return homes;
}

function isInside(unit: Unit, level: number, column: number): boolean {
  return (
    level === unit.level && column >= unit.x && column < unit.x + UNIT_CATALOG[unit.type].width
  );
}

/**
 * Unit numbers of the homes with at least one of their own people awake inside them, standing
 * still in the tower. A condo or hotel room is only in use then: asleep or away, a home is quiet.
 */
export function homesInUse(state: TowerState): Set<number> {
  const inUse = new Set<number>();
  const lived = livedInHomes(state);
  if (lived.size === 0) return inUse;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    const home = pool.homeUnit[slot] as number;
    const unit = lived.get(home);
    if (unit === undefined || inUse.has(home)) continue;
    if (!isInside(unit, pool.level[slot] as number, pool.column[slot] as number)) continue;
    if (isOnTrek(pool, slot) || isOutsideTower(pool, slot) || isAsleep(pool, slot)) continue;
    inUse.add(home);
  }
  return inUse;
}

const STEPS_PER_DAY = 8640;
const STEPS_PER_HOUR = 360;

/**
 * Whether the unit is in use this minute: open to customers, worked in, or a home with someone of
 * it awake inside (`homes`, from homesInUse; worked out when left out).
 */
export function isUnitInUse(
  state: TowerState,
  unit: Unit,
  homes: ReadonlySet<number> = homesInUse(state),
): boolean {
  switch (unit.type) {
    case 'fast-food':
    case 'restaurant':
    case 'retail-shop':
    case 'cinema':
    case 'party-hall':
      return isVenueOpenNow(state, unit);
    case 'office': {
      if (unit.lease === null) return false;
      const hour = Math.floor((state.step % STEPS_PER_DAY) / STEPS_PER_HOUR);
      return hour >= 8 && hour < 18;
    }
    case 'condo':
      return unit.sale !== null && homes.has(unitNumber(unit.id));
    case 'single-room':
    case 'double-room':
    case 'suite':
      return unit.hotel?.state === 'occupied' && homes.has(unitNumber(unit.id));
    default:
      return false;
  }
}
