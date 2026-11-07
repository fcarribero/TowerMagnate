/** Every kind of person in a tower (people spec section 2), in a fixed order: index = stored code. */
export const PERSON_KINDS = [
  'officeWorker',
  'resident',
  'hotelGuest',
  'customer',
  'audience',
  'partyGuest',
  'maid',
  'guard',
  'vip',
  'weddingGuest',
  'prospect',
] as const;

/**
 * Every person in the tower, one slot per person across parallel arrays of the same length.
 * Slots are sorted by increasing person id with no gaps.
 */
export interface PersonPool {
  /** The id the next person gets; ids are never reused. */
  nextId: number;
  /** Person number: person `p12` has id 12. */
  id: number[];
  /** Index into PERSON_KINDS. */
  kind: number[];
  /** Number of the unit the person belongs to (`u7` is 7), or 0 for visitors from outside. */
  homeUnit: number[];
  level: number[];
  column: number[];
  /** Current trip, or 0 when the person is not travelling. */
  trip: number[];
  /** Step at which the person next has something to do, or -1 for none. */
  dueStep: number[];
  stress: number[];
  /** Picks the person's generated name. */
  nameSeed: number[];
  /** Ids of followed people, in increasing order, at most MAX_FOLLOWED_PEOPLE. */
  followed: number[];
}
