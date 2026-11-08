import { dateOfStep, STEPS_PER_HOUR, STEPS_PER_MINUTE } from '@tower-magnate/engine/calendar';
import {
  DWELL_SECONDS_OPTIONS,
  ELEVATOR_BAND_STARTS,
  RESPONSE_DISTANCE_MAX,
  RESPONSE_DISTANCE_MIN,
  type ElevatorMode,
  type ShaftBand,
  type ShaftSchedule,
} from '@tower-magnate/shared';

export type DayType = 'weekday' | 'weekend';

/** One band as typed in the window: number fields stay text until they are valid. */
export interface BandDraft {
  mode: ElevatorMode;
  dwell: string;
  response: string;
}

export type ScheduleDraft = Record<DayType, BandDraft[]>;

export interface BandInForce {
  dayType: DayType;
  index: number;
}

const HOURS_PER_DAY = 24;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function hourLabel(hour: number): string {
  return `${twoDigits(hour)}:00`;
}

/** Start and end of each band as `HH:MM`, the last one ending at 24:00. */
export function bandRanges(): { from: string; to: string }[] {
  const hours = ELEVATOR_BAND_STARTS.map((start) => start / STEPS_PER_HOUR);
  return hours.map((hour, index) => ({
    from: hourLabel(hour),
    to: hourLabel(hours[index + 1] ?? HOURS_PER_DAY),
  }));
}

export function bandInForce(step: number): BandInForce {
  const date = dateOfStep(step);
  const stepOfDay = date.hour * STEPS_PER_HOUR + date.minute * STEPS_PER_MINUTE;
  const index = ELEVATOR_BAND_STARTS.filter((start) => start <= stepOfDay).length - 1;
  return { dayType: date.isWeekend ? 'weekend' : 'weekday', index };
}

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function parseDwell(text: string): number | null {
  const value = wholeNumber(text);
  const allowed = DWELL_SECONDS_OPTIONS as readonly number[];
  return value !== null && allowed.includes(value) ? value : null;
}

export function parseResponse(text: string): number | null {
  const value = wholeNumber(text);
  const inRange =
    value !== null && value >= RESPONSE_DISTANCE_MIN && value <= RESPONSE_DISTANCE_MAX;
  return inRange ? value : null;
}

function draftBand(band: ShaftBand): BandDraft {
  return {
    mode: band.mode,
    dwell: String(band.dwellSeconds),
    response: String(band.responseDistance),
  };
}

export function draftOf(schedule: ShaftSchedule): ScheduleDraft {
  return { weekday: schedule.weekday.map(draftBand), weekend: schedule.weekend.map(draftBand) };
}

function parseBand(band: BandDraft): ShaftBand | null {
  const dwellSeconds = parseDwell(band.dwell);
  const responseDistance = parseResponse(band.response);
  if (dwellSeconds === null || responseDistance === null) {
    return null;
  }
  return { mode: band.mode, dwellSeconds, responseDistance };
}

function parseDay(bands: readonly BandDraft[]): ShaftBand[] | null {
  const parsed = bands.map(parseBand);
  return parsed.every((band) => band !== null) ? (parsed as ShaftBand[]) : null;
}

/** The schedule to send, or null while any field is out of range. */
export function parseSchedule(draft: ScheduleDraft): ShaftSchedule | null {
  const weekday = parseDay(draft.weekday);
  const weekend = parseDay(draft.weekend);
  return weekday && weekend ? { weekday, weekend } : null;
}

export function scheduleChanged(saved: ShaftSchedule, draft: ScheduleDraft): boolean {
  return JSON.stringify(draftOf(saved)) !== JSON.stringify(draft);
}

export function updateBand(
  draft: ScheduleDraft,
  dayType: DayType,
  index: number,
  patch: Partial<BandDraft>,
): ScheduleDraft {
  const bands = draft[dayType].map((band, position) =>
    position === index ? { ...band, ...patch } : band,
  );
  return { ...draft, [dayType]: bands };
}

export function otherDayType(dayType: DayType): DayType {
  return dayType === 'weekday' ? 'weekend' : 'weekday';
}

export function copyDay(draft: ScheduleDraft, from: DayType): ScheduleDraft {
  const copied = draft[from].map((band) => ({ ...band }));
  return { ...draft, [otherDayType(from)]: copied };
}
