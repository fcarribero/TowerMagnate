import { CONDO_INTERIOR } from './condo';
import { DOUBLE_ROOM_INTERIOR, SINGLE_ROOM_INTERIOR, SUITE_INTERIOR } from './hotel';
import { OFFICE_INTERIOR } from './office';
import type { InteriorSpec } from './types';

export * from './types';
export * from './layout';
export * from './view';
export { OFFICE_INTERIOR } from './office';
export { CONDO_INTERIOR } from './condo';
export { DOUBLE_ROOM_INTERIOR, SINGLE_ROOM_INTERIOR, SUITE_INTERIOR } from './hotel';

/** Every unit type whose furniture is built from a seed, by unit type. */
export const INTERIOR_SPECS: Readonly<Record<string, InteriorSpec>> = {
  office: OFFICE_INTERIOR as InteriorSpec,
  condo: CONDO_INTERIOR as InteriorSpec,
  'single-room': SINGLE_ROOM_INTERIOR as InteriorSpec,
  'double-room': DOUBLE_ROOM_INTERIOR as InteriorSpec,
  suite: SUITE_INTERIOR as InteriorSpec,
};

/** The interior spec of a unit type, or undefined when it is drawn from fixed sprites. */
export function interiorSpecOf(unitType: string): InteriorSpec | undefined {
  return INTERIOR_SPECS[unitType];
}
