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

/** Residents (people spec 7), shares as fractions. */
export const RESIDENT_WORKDAY_CHANCE = 0.7;

export const RESIDENT_LEAVE: readonly WindowPart[] = [
  { from: minutes(6, 30), to: minutes(7, 30), weight: 30 },
  { from: minutes(7, 30), to: minutes(8, 30), weight: 50 },
  { from: minutes(8, 30), to: minutes(9), weight: 20 },
];

export const RESIDENT_RETURN: readonly WindowPart[] = [
  { from: minutes(17), to: minutes(18), weight: 30 },
  { from: minutes(18), to: minutes(19), weight: 35 },
  { from: minutes(19), to: minutes(20), weight: 25 },
  { from: minutes(20), to: minutes(21), weight: 10 },
];

export const RESIDENT_WEEKDAY_SHOPPING_CHANCE = 0.6;

export const RESIDENT_WEEKDAY_SHOPPING: readonly WindowPart[] = [
  { from: minutes(10), to: minutes(13), weight: 40 },
  { from: minutes(13), to: minutes(17), weight: 60 },
];

export const RESIDENT_WEEKDAY_DINNER_CHANCE = 0.15;

export const RESIDENT_WEEKDAY_DINNER: readonly WindowPart[] = [
  { from: minutes(19, 30), to: minutes(21), weight: 100 },
];

export const RESIDENT_WEEKEND_MORNING_CHANCE = 0.6;

export const RESIDENT_WEEKEND_MORNING: readonly WindowPart[] = [
  { from: minutes(10), to: minutes(11), weight: 40 },
  { from: minutes(11), to: minutes(12), weight: 60 },
];

export const RESIDENT_WEEKEND_AFTERNOON_CHANCE = 0.6;

export const RESIDENT_WEEKEND_AFTERNOON: readonly WindowPart[] = [
  { from: minutes(14), to: minutes(16), weight: 50 },
  { from: minutes(16), to: minutes(18), weight: 50 },
];

export const RESIDENT_WEEKEND_DINNER_CHANCE = 0.25;

export const RESIDENT_WEEKEND_DINNER: readonly WindowPart[] = [
  { from: minutes(19), to: minutes(21), weight: 100 },
];

/** A shopping or snack trip goes to a retail shop with this chance, otherwise to a fast food. */
export const RESIDENT_RETAIL_TRIP_CHANCE = 0.6;

export type VisitedVenueType = 'fast-food' | 'restaurant' | 'retail-shop';

export const VENUE_VISIT_MINUTES: Readonly<Record<VisitedVenueType, number>> = {
  'fast-food': 45,
  restaurant: 60,
  'retail-shop': 45,
};

export const VENUE_CAPACITY: Readonly<Record<VisitedVenueType, number>> = {
  'fast-food': FAST_FOOD_CAPACITY,
  restaurant: 40,
  'retail-shop': 25,
};

export const VENUE_HOURS: Readonly<Record<VisitedVenueType, { open: number; close: number }>> = {
  'fast-food': FAST_FOOD_HOURS,
  restaurant: { open: minutes(17), close: minutes(23) },
  'retail-shop': { open: minutes(10), close: minutes(20) },
};

/** When outside customers appear at each kind of venue (people spec 11.1). */
export const CUSTOMER_ARRIVAL: Readonly<Record<VisitedVenueType, readonly WindowPart[]>> = {
  'fast-food': [
    { from: minutes(8), to: minutes(11), weight: 20 },
    { from: minutes(11), to: minutes(14), weight: 50 },
    { from: minutes(14), to: minutes(17), weight: 15 },
    { from: minutes(17), to: minutes(19, 30), weight: 15 },
  ],
  restaurant: [
    { from: minutes(17), to: minutes(19), weight: 35 },
    { from: minutes(19), to: minutes(21), weight: 50 },
    { from: minutes(21), to: minutes(22, 30), weight: 15 },
  ],
  'retail-shop': [
    { from: minutes(10), to: minutes(12), weight: 20 },
    { from: minutes(12), to: minutes(15), weight: 30 },
    { from: minutes(15), to: minutes(19, 30), weight: 50 },
  ],
};

/** How long an outside customer stays inside the venue (people spec 11.2). */
export const CUSTOMER_STAY_MINUTES: Readonly<Record<VisitedVenueType, number>> = {
  'fast-food': 30,
  restaurant: 60,
  'retail-shop': 45,
};

/** Outside customers a day before the other factors (people spec 11.3). */
export const OUTSIDE_CUSTOMER_BASE: Readonly<
  Record<VisitedVenueType, { weekday: number; weekend: number }>
> = {
  'fast-food': { weekday: 20, weekend: 30 },
  restaurant: { weekday: 20, weekend: 30 },
  'retail-shop': { weekday: 20, weekend: 25 },
};

/** Price factor of a retail shop's outside customers; food venues always use 1. */
export const RETAIL_PRICE_CUSTOMER_FACTOR: Readonly<
  Record<'high' | 'normal' | 'low' | 'minimum', number>
> = { high: 0.7, normal: 1, low: 1.2, minimum: 1.4 };

/** Outside visitors are multiplied by this when the tower has a subway station. */
export const SUBWAY_VISITOR_FACTOR = 1.2;

/** Chance that an outside trip uses the subway entrance when the tower has a station (people spec 3). */
export const SUBWAY_ENTRANCE_CHANCE = 0.25;

/** Weight of a retail shop when a person draws venue candidates (people spec 5). */
export const RETAIL_PRICE_ATTRACTION: Readonly<
  Record<'high' | 'normal' | 'low' | 'minimum', number>
> = { high: 0.5, normal: 1, low: 1.5, minimum: 2 };

/** Hours of the day (whole hours, inclusive) at which vacant units roll for a prospect. */
export const PROSPECT_ROLL_HOURS = { first: 8, last: 18 } as const;

/** Chance per roll that a vacant unit gets a prospect, by price level (people spec 18). */
export const PROSPECT_CHANCE: Readonly<Record<'high' | 'normal' | 'low' | 'minimum', number>> = {
  high: 0.1,
  normal: 0.2,
  low: 0.3,
  minimum: 0.4,
};

/** Guests of one wedding attempt, the cathedral's capacity (people spec 2). */
export const WEDDING_GUESTS = 40;

/** When wedding guests appear at the street entrance on an attempt day (people spec 15). */
export const WEDDING_GUEST_ARRIVAL: readonly WindowPart[] = [
  { from: minutes(8), to: minutes(9), weight: 40 },
  { from: minutes(9), to: minutes(10), weight: 40 },
  { from: minutes(10), to: minutes(10, 30), weight: 20 },
];

/** The last guest must be inside the cathedral before this minute of the day (stars spec 7.2). */
export const WEDDING_DEADLINE_MINUTE = minutes(12, 30);

/** Every wedding guest leaves the tower at this minute of the day (people spec 15). */
export const WEDDING_GUESTS_LEAVE_MINUTE = minutes(15);

/** Hotel guests (people spec 8). */
/** Every room that can take a booking rolls once at this minute of the day. */
export const HOTEL_BOOKING_ROLL_MINUTE = minutes(12);

/** A room that becomes clean before this minute rolls for a booking at once. */
export const HOTEL_LATE_ROLL_BEFORE_MINUTE = minutes(21);

/** Arrival of a party booked by the 12:00 roll. */
export const HOTEL_NOON_ARRIVAL: readonly WindowPart[] = [
  { from: minutes(12), to: minutes(17), weight: 25 },
  { from: minutes(17), to: minutes(21), weight: 55 },
  { from: minutes(21), to: minutes(22, 30), weight: 20 },
];

/** A party booked after 12:00 arrives at least this long after the roll. */
export const HOTEL_LATE_ARRIVAL_DELAY_MINUTES = 30;

/** No party arrives at or after this minute. */
export const HOTEL_LAST_ARRIVAL_MINUTE = minutes(22, 30);

/** A party with nobody in the room at this minute gives up. */
export const HOTEL_GIVE_UP_MINUTE = minutes(23);

/** Evening outing on the check-in day: a uniform minute from check-in plus the delay to the end. */
export const HOTEL_CHECK_IN_OUTING_CHANCE = 0.4;
export const HOTEL_CHECK_IN_OUTING_DELAY_MINUTES = 30;
export const HOTEL_OUTING_END_MINUTE = minutes(21, 30);

export const HOTEL_DAY_OUT_CHANCE = 0.5;

export const HOTEL_DAY_OUT_LEAVE: readonly WindowPart[] = [
  { from: minutes(9), to: minutes(11), weight: 100 },
];

export const HOTEL_DAY_OUT_RETURN: readonly WindowPart[] = [
  { from: minutes(16), to: minutes(20), weight: 100 },
];

export const HOTEL_EVENING_OUTING_CHANCE = 0.4;

export const HOTEL_EVENING_OUTING: readonly WindowPart[] = [
  { from: minutes(19), to: HOTEL_OUTING_END_MINUTE, weight: 100 },
];

export const HOTEL_CHECK_OUT_LEAVE: readonly WindowPart[] = [
  { from: minutes(6), to: minutes(7), weight: 15 },
  { from: minutes(7), to: minutes(8), weight: 25 },
  { from: minutes(8), to: minutes(9), weight: 35 },
  { from: minutes(9), to: minutes(10), weight: 25 },
];

/** The VIP (people spec 9). */
export const VIP_ARRIVAL: readonly WindowPart[] = [
  { from: minutes(17), to: minutes(19), weight: 50 },
  { from: minutes(19), to: minutes(21), weight: 50 },
];

export const VIP_LEAVE: readonly WindowPart[] = [
  { from: minutes(8), to: minutes(9), weight: 50 },
  { from: minutes(9), to: minutes(10), weight: 50 },
];

/** Where a guest goes on an outing, in percent, highest first. */
export const HOTEL_OUTING_VENUES: readonly { type: VisitedVenueType; weight: number }[] = [
  { type: 'restaurant', weight: 50 },
  { type: 'fast-food', weight: 25 },
  { type: 'retail-shop', weight: 25 },
];

/** Maids and housekeeping (people spec 10, hotel spec 3 to 6). */
/** The maids of every housekeeping unit appear at its door at this minute of the day. */
export const MAID_APPEAR_MINUTE = minutes(9, 30);

/** Every maid leaves the simulation at this minute, wherever she is. */
export const MAID_LEAVE_MINUTE = minutes(17);

/** A maid may ask for a room from this minute of the day. */
export const CLEANING_START_FROM_MINUTE = minutes(10);

/** A cleaning starts only before this minute; it is also the end of the asking window. */
export const CLEANING_START_BEFORE_MINUTE = minutes(16);

/** One cleaning, for single rooms, double rooms and suites alike. */
export const CLEANING_MINUTES = 30;

/** Cleanings one maid may start in a day. */
export const MAID_DAILY_CLEANINGS = 8;

/** An idle maid asks again at every multiple of this many minutes. */
export const MAID_RETRY_MINUTES = 30;

/** Infestation (hotel spec 7). The daily check runs at 00:00. */
export const INFESTATION_CHECK_MINUTE = minutes(0);

/** Daily checks that find a room dirty before it becomes infested. */
export const INFESTATION_DIRTY_CHECKS = 3;
