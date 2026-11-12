import {
  CINEMA_AUDIENCE_ARRIVAL,
  CINEMA_LATE_ENTRY_MINUTES,
  CINEMA_SHOW_HOURS,
  CINEMA_SHOW_LENGTH_HOURS,
  PARTY_GUEST_ARRIVAL,
  PARTY_HALL_ENTRY_CLOSES,
  SUBWAY_VISITOR_FACTOR,
  UNIT_CATALOG,
  VENUE_PAYOUT_HOURS,
  type PersonKind,
  type TowerState,
  type Unit,
  type VenueDay,
  type WindowPart,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { cinemaShowCap, filmAgeDays } from './films';
import { venueStressFactor } from './person-stress';
import { drawMinuteFromWindow } from './time-windows';

export type ShowVenueType = 'cinema' | 'party-hall';
export type ShowVenue = Unit & { type: ShowVenueType; venue: VenueDay };

export function isShowVenue(unit: Unit): unit is ShowVenue {
  return (unit.type === 'cinema' || unit.type === 'party-hall') && unit.venue !== null;
}

export function showVisitorKind(type: ShowVenueType): PersonKind {
  return type === 'cinema' ? 'audience' : 'partyGuest';
}

/** One show or party of the day, as steps since midnight. */
interface ShowWindow {
  /** Window the visitors appear in, as minutes of the day. */
  appearance: readonly WindowPart[];
  starts: number;
  /** First step at which a visitor is turned away. */
  entryCloses: number;
  ends: number;
}

function cinemaWindow(startHour: number): ShowWindow {
  const starts = startHour * STEPS_PER_HOUR;
  const startMinute = startHour * 60;
  return {
    appearance: CINEMA_AUDIENCE_ARRIVAL.map((part) => ({
      ...part,
      from: startMinute + part.from,
      to: startMinute + part.to,
    })),
    starts,
    entryCloses: starts + CINEMA_LATE_ENTRY_MINUTES * STEPS_PER_MINUTE + 1,
    ends: starts + CINEMA_SHOW_LENGTH_HOURS * STEPS_PER_HOUR,
  };
}

const PARTY_HALL_HOURS = VENUE_PAYOUT_HOURS['party-hall'];

const SHOW_WINDOWS: Readonly<Record<ShowVenueType, readonly ShowWindow[]>> = {
  cinema: CINEMA_SHOW_HOURS.map(cinemaWindow),
  'party-hall': [
    {
      appearance: PARTY_GUEST_ARRIVAL,
      starts: PARTY_HALL_HOURS.opens * STEPS_PER_HOUR,
      entryCloses: PARTY_HALL_ENTRY_CLOSES * STEPS_PER_MINUTE,
      ends: PARTY_HALL_HOURS.pays * STEPS_PER_HOUR,
    },
  ],
};

function percent(factor: number): number {
  return Math.round(factor * 100);
}

export interface ShowGuestFactors {
  /** Most people the show or party admits. */
  cap: number;
  /** Average trip stress of yesterday's visits in steps, or null when nobody walked there. */
  averageStress: number | null;
  subway: boolean;
}

/**
 * Visitors of one show or party, min(cap, floor(cap x stress x subway)) (people spec 12 and 13).
 * The factors are multiplied as whole percents so the floor never lands one short.
 */
export function showGuestCount(factors: ShowGuestFactors): number {
  const stress = factors.averageStress === null ? 1 : venueStressFactor(factors.averageStress);
  const subway = factors.subway ? SUBWAY_VISITOR_FACTOR : 1;
  const product = factors.cap * percent(stress) * percent(subway);
  return Math.min(factors.cap, Math.floor(product / 10_000));
}

/** The cap of the show or party today: the film's cap for a cinema, the hall's capacity otherwise. */
export function showCapacity(state: TowerState, unit: ShowVenue): number {
  if (unit.type === 'party-hall') return UNIT_CATALOG['party-hall'].capacity?.people ?? 0;
  return cinemaShowCap(filmAgeDays(state, unit) ?? 0);
}

/** Appearance steps of today's visitors of every show, earliest first. */
export function drawShowArrivals(
  state: TowerState,
  unit: ShowVenue,
  guestsPerShow: number,
  dayStart: number,
): number[] {
  const minutes: number[] = [];
  for (const show of SHOW_WINDOWS[unit.type]) {
    for (let guest = 0; guest < guestsPerShow; guest++) {
      minutes.push(drawMinuteFromWindow(state.rng, show.appearance));
    }
  }
  minutes.sort((a, b) => a - b);
  return minutes.map((minute) => dayStart + minute * STEPS_PER_MINUTE);
}

export type ShowEntry =
  { kind: 'wait'; until: number } | { kind: 'enter'; endsAt: number } | { kind: 'turnAway' };

function appearsFrom(show: ShowWindow): number {
  return Math.min(...show.appearance.map((part) => part.from)) * STEPS_PER_MINUTE;
}

/**
 * What happens to a visitor who reaches the venue at this step of the day: wait inside for the
 * start, go in, or leave because the entry time is over. Steps are steps of the day.
 */
export function showEntryAt(type: ShowVenueType, stepOfDay: number): ShowEntry {
  const show = SHOW_WINDOWS[type].find((window) => stepOfDay < window.entryCloses);
  if (!show || stepOfDay < appearsFrom(show)) return { kind: 'turnAway' };
  if (stepOfDay < show.starts) return { kind: 'wait', until: show.starts };
  return { kind: 'enter', endsAt: show.ends };
}
