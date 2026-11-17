import type { TowerState, Unit } from '@tower-magnate/shared';
import { isVenueOpenNow } from './customers';

const STEPS_PER_DAY = 8640;
const STEPS_PER_HOUR = 360;

/** Whether the unit is in use this minute: open to customers, worked in, lived in or occupied. */
export function isUnitInUse(state: TowerState, unit: Unit): boolean {
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
      return unit.sale !== null;
    case 'single-room':
    case 'double-room':
    case 'suite':
      return unit.hotel?.state === 'occupied';
    default:
      return false;
  }
}
