/** A part of a daily time window, in minutes since midnight: `from` is included, `to` is not. */
export interface WindowPart {
  from: number;
  to: number;
  /** Percent chance of the part inside its window. */
  weight: number;
}

function minutes(hours: number, minute = 0): number {
  return hours * 60 + minute;
}

/** Office workers, weekdays only (people spec 6.1). */
export const OFFICE_WORKER_ARRIVAL: readonly WindowPart[] = [
  { from: minutes(7, 30), to: minutes(8), weight: 20 },
  { from: minutes(8), to: minutes(9), weight: 60 },
  { from: minutes(9), to: minutes(9, 30), weight: 20 },
];

export const OFFICE_WORKER_LUNCH_DEPARTURE: readonly WindowPart[] = [
  { from: minutes(12), to: minutes(12, 30), weight: 50 },
  { from: minutes(12, 30), to: minutes(13), weight: 35 },
  { from: minutes(13), to: minutes(13, 30), weight: 15 },
];

export const OFFICE_WORKER_LEAVE: readonly WindowPart[] = [
  { from: minutes(17), to: minutes(17, 30), weight: 40 },
  { from: minutes(17, 30), to: minutes(18), weight: 30 },
  { from: minutes(18), to: minutes(18, 30), weight: 20 },
  { from: minutes(18, 30), to: minutes(19), weight: 10 },
];

export const OFFICE_WORKER_LUNCH_CHANCE = 0.8;

export const FAST_FOOD_LUNCH_MINUTES = 30;

/** Venues the engine can send a person to, with opening hours in minutes since midnight. */
export const FAST_FOOD_HOURS = { open: minutes(8), close: minutes(20) } as const;

/** People inside a fast food at once; a venue is full at this count (people spec 11.2). */
export const FAST_FOOD_CAPACITY = 40;

/** Candidates drawn when a person picks a venue (people spec 5). */
export const VENUE_CANDIDATES_DRAWN = 3;

/** A required trip with no route is tried again after this many steps (people spec 4). */
export const ROUTE_RETRY_STEPS = 720;
