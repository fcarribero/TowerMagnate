import { VENUE_HOURS, type UnitType, type VisitedVenueType } from '@tower-magnate/shared';

const STEPS_PER_MINUTE = 6;
const MINUTES_PER_DAY = 24 * 60;

const VENUE_TYPES = Object.keys(VENUE_HOURS) as VisitedVenueType[];

/** The venue types that are open at some moment. */
export type OpenVenues = ReadonlySet<UnitType>;

export const ALL_VENUES_OPEN: OpenVenues = new Set<UnitType>(VENUE_TYPES);

/** One set per combination, so the same hours give the same instance and the store sees no change. */
const setsByKey = new Map<string, OpenVenues>();

/** The venue types inside their opening hours at this step. Step 0 is midnight. */
export function openVenuesAt(step: number): OpenVenues {
  const minute = Math.floor(step / STEPS_PER_MINUTE) % MINUTES_PER_DAY;
  const open = VENUE_TYPES.filter((type) => {
    const hours = VENUE_HOURS[type];
    return minute >= hours.open && minute < hours.close;
  });
  const key = open.join(',');
  let set = setsByKey.get(key);
  if (set === undefined) {
    set = new Set<UnitType>(open);
    setsByKey.set(key, set);
  }
  return set;
}

export function isVenue(type: UnitType): boolean {
  return ALL_VENUES_OPEN.has(type);
}
