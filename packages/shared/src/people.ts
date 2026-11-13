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
  'builder',
  'staff',
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
  /** Person stress P in steps, kept up to date while the person travels and when a trip is recorded. */
  stress: number[];
  /** Stress steps collected so far on the current trip, without the long-trip extra. */
  tripSum: number[];
  /** Standard and service ride floors plus stair floors of the current trip. */
  tripSlowFloors: number[];
  /** Step at which the wait in a queue began, or the ride began once the person boarded. */
  tripPartStep: number[];
  /** Wait steps the tall lobby the person queues in takes off the wait under way. */
  tripPartCut: number[];
  /** Picks the person's generated name. */
  nameSeed: number[];
  /** What the person is doing on a trip: an index into the engine's trek phases, 0 when idle. */
  trek: number[];
  /** Level the trip ends on. */
  trekLevel: number[];
  /** Column the trip ends on. */
  trekColumn: number[];
  /** Stair floors, escalator floors and rides finished on this trip, packed into one number. */
  trekBudget: number[];
  /** Number of the stair, escalator or shaft the current leg uses. */
  legVia: number[];
  /** Level the current leg ends on. */
  legLevel: number[];
  /** Column the person is walking to on the current leg. */
  legColumn: number[];
  /** Step at which a flight ends or a full queue is checked again. */
  legStep: number[];
  /** Switches made beside full queues in this trip, at most FULL_QUEUE_MAX_SWITCHES_PER_TRIP. */
  tripSwitches: number[];
  /** Rechecks made beside the current full queue, counted up to FULL_QUEUE_STAY_RECHECKS. */
  queueRechecks: number[];
  /** Numbers of the shafts left in this trip, first and second packed into one number; 0 is none. */
  leftShafts: number[];
  /** 1 when the last horizontal move was to the left, otherwise 0. */
  facing: number[];
  /** Energy in thousandths of a level, from 1,000 (level 1) to 10,000 (level 10). */
  energy: number[];
  /** Ids of followed people, in increasing order, at most MAX_FOLLOWED_PEOPLE. Each has a name. */
  followed: number[];
  /** Names the player gave, by person id. People without an entry are unnamed. */
  names: Record<number, string>;
}
