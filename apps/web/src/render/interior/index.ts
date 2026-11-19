import { CLEANING_ROOM_INTERIOR } from './cleaning';
import { CONDO_INTERIOR } from './condo';
import { FAST_FOOD_INTERIOR } from './fastFood';
import { DOUBLE_ROOM_INTERIOR, SINGLE_ROOM_INTERIOR, SUITE_INTERIOR } from './hotel';
import { HOUSEKEEPING_INTERIOR } from './housekeeping';
import { MEDICAL_INTERIOR } from './medical';
import { OFFICE_INTERIOR } from './office';
import { RESTAURANT_INTERIOR } from './restaurant';
import { RETAIL_LINES, retailLineOf } from './retail';
import { SECURITY_INTERIOR } from './security';
import type { InteriorSpec } from './types';

export * from './types';
export * from './layout';
export * from './view';
export { OFFICE_INTERIOR } from './office';
export { CONDO_INTERIOR } from './condo';
export { DOUBLE_ROOM_INTERIOR, SINGLE_ROOM_INTERIOR, SUITE_INTERIOR } from './hotel';
export { HOUSEKEEPING_INTERIOR } from './housekeeping';
export { CLEANING_ROOM_INTERIOR } from './cleaning';
export { FAST_FOOD_INTERIOR } from './fastFood';
export { MEDICAL_INTERIOR } from './medical';
export { RESTAURANT_INTERIOR } from './restaurant';
export { RETAIL_LINES, retailLineOf } from './retail';
export { SECURITY_INTERIOR } from './security';

/** Every unit type whose furniture is built from a seed, by unit type. */
export const INTERIOR_SPECS: Readonly<Record<string, InteriorSpec>> = {
  office: OFFICE_INTERIOR as InteriorSpec,
  condo: CONDO_INTERIOR as InteriorSpec,
  'single-room': SINGLE_ROOM_INTERIOR as InteriorSpec,
  'double-room': DOUBLE_ROOM_INTERIOR as InteriorSpec,
  suite: SUITE_INTERIOR as InteriorSpec,
  housekeeping: HOUSEKEEPING_INTERIOR as InteriorSpec,
  'cleaning-room': CLEANING_ROOM_INTERIOR as InteriorSpec,
  'fast-food': FAST_FOOD_INTERIOR as InteriorSpec,
  restaurant: RESTAURANT_INTERIOR as InteriorSpec,
  security: SECURITY_INTERIOR as InteriorSpec,
  'medical-center': MEDICAL_INTERIOR as InteriorSpec,
  // A retail shop sells one of four lines, each with its own bare shop: retail-shop (clothes),
  // retail-shop-books, retail-shop-grocery and retail-shop-electronics.
  ...Object.fromEntries(RETAIL_LINES.map((spec) => [spec.unitType, spec as InteriorSpec])),
};

/**
 * The interior spec of a unit type, or undefined when it is drawn from fixed sprites. A retail
 * shop's seed also picks the line it sells, so with a seed it gives that line's spec.
 */
export function interiorSpecOf(unitType: string, seed?: number): InteriorSpec | undefined {
  if (unitType === 'retail-shop' && seed !== undefined) return retailLineOf(seed) as InteriorSpec;
  return INTERIOR_SPECS[unitType];
}
