import { dateOfStep } from '@tower-magnate/engine/calendar';
import type {
  Evaluation,
  InspectedUnitDetails,
  Level,
  PersonKind,
  PriceBand,
  UnitType,
} from '@tower-magnate/shared';
import type { UnitInspect } from '../../model/inspectStore';
import { formatMoney } from '../money';
import { formatGameTime } from '../status/statusFormat';
import { t, type StringKey } from '../strings';
import type { TooltipLine } from '../kit';

export const NAME_MAX_LENGTH = 24;
export const FILM_CHANGE_COST = 300_000;
const FIRST_CATHEDRAL_LEVEL = 101;

export function levelText(level: Level): string {
  if (level < 0) {
    return t('ui.levelBasement', { n: -level });
  }
  return level >= FIRST_CATHEDRAL_LEVEL ? t('ui.levelCathedral') : t('ui.levelFloor', { n: level });
}

export function typeName(type: UnitType): string {
  return t(`unit.${type}` as StringKey);
}

export function unitTitle(unit: Pick<UnitInspect, 'name' | 'type' | 'level'>): string {
  return (
    unit.name ?? t('window.unit.title', { type: typeName(unit.type), level: levelText(unit.level) })
  );
}

/** Where the unit is: the floor only, never the columns it covers. */
export function locationText(unit: Pick<UnitInspect, 'level'>): string {
  return levelText(unit.level);
}

export function priceLabelKey(type: UnitType): StringKey | null {
  if (type === 'office' || type === 'retail-shop') {
    return 'window.unit.pricePerWeek';
  }
  if (type === 'single-room' || type === 'double-room' || type === 'suite') {
    return 'window.unit.pricePerNight';
  }
  return type === 'condo' ? 'window.unit.salePrice' : null;
}

export function isSoldCondo(unit: Pick<UnitInspect, 'details'>): boolean {
  return unit.details?.group === 'condo' && unit.details.state === 'sold';
}

type Details<G extends InspectedUnitDetails['group']> = Extract<InspectedUnitDetails, { group: G }>;

export interface PriceControl {
  price: number;
  appraisal: number;
  band: PriceBand;
  min: number;
  max: number;
  step: number;
}

/** The price the player can change, or null for a unit with no price and for a sold condo. */
export function priceControlOf(unit: Pick<UnitInspect, 'details'>): PriceControl | null {
  const { details } = unit;
  if (details === null || !('priceMin' in details) || isSoldCondo(unit)) {
    return null;
  }
  if (
    details.price === undefined ||
    details.appraisal === undefined ||
    details.priceBand === undefined ||
    details.priceMin === undefined ||
    details.priceMax === undefined ||
    details.priceStep === undefined
  ) {
    return null;
  }
  return {
    price: details.price,
    appraisal: details.appraisal,
    band: details.priceBand,
    min: details.priceMin,
    max: details.priceMax,
    step: details.priceStep,
  };
}

/** A typed or dragged price, rounded to the step and kept inside the limits. */
export function clampPrice(value: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return Math.min(Math.max(stepped, min), max);
}

/** Where the appraisal sits along the price bar, 0 to 100. */
export function appraisalPercent(appraisal: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((appraisal - min) / (max - min)) * 100));
}

export function priceBandLabel(band: PriceBand): string {
  return t(`value.price.${band}` as StringKey);
}

/** Whether the builders take this site first; null for anything that is not a site. */
export function priorityOf(unit: Pick<UnitInspect, 'details'>): boolean | null {
  const { details } = unit;
  return details?.group === 'construction' ? (details.priority ?? false) : null;
}

/** Whether the unit is on the market: for sale or for rent. Null for units with no such switch. */
export function listedOf(unit: Pick<UnitInspect, 'details'>): boolean | null {
  const { details } = unit;
  if (details?.group === 'lease' || details?.group === 'condo') {
    return details.listed;
  }
  return details?.group === 'construction' ? (details.listed ?? null) : null;
}

export interface PeopleGroup {
  id:
    | 'residents'
    | 'workers'
    | 'staff'
    | 'customers'
    | 'tenants'
    | 'maids'
    | 'cleaners'
    | 'officers'
    | 'audience'
    | 'doctors';
  label: string;
  /** Person ids, in the order the server sent them. */
  people: readonly string[];
  /** Used to draw each person when the tower view does not know them. */
  kind: PersonKind;
  /** People per row, side by side with no overlap. Without it the row is a queue that packs to fit. */
  columns?: number;
}

/** The people blocks of a unit window: who lives, works, stays or is inside as a customer. */
/** Office workers stand side by side in one row of up to 6, a full office. */
export const OFFICE_PEOPLE_COLUMNS = 6;

export function peopleGroups(unit: Pick<UnitInspect, 'type' | 'details'>): PeopleGroup[] {
  const { details } = unit;
  if (details === null) {
    return [];
  }
  switch (details.group) {
    case 'condo':
      return [
        {
          id: 'residents',
          label: t('window.unit.residents'),
          people: details.residents,
          kind: 'resident',
        },
      ];
    case 'hotel':
      return [
        {
          id: 'tenants',
          label: t('window.unit.peopleTenants'),
          people: details.tenants,
          kind: 'hotelGuest',
        },
      ];
    case 'lease': {
      const office = unit.type === 'office';
      const groups: PeopleGroup[] = [
        {
          id: office ? 'workers' : 'staff',
          label: t(office ? 'window.unit.peopleWorkers' : 'window.unit.peopleStaff'),
          people: details.workers,
          kind: office ? 'officeWorker' : 'staff',
          ...(office ? { columns: OFFICE_PEOPLE_COLUMNS } : {}),
        },
      ];
      if (!office) {
        groups.push({
          id: 'customers',
          label: t('window.unit.peopleCustomers'),
          people: details.customers,
          kind: 'customer',
        });
      }
      return groups;
    }
    case 'venue':
      return [
        {
          id: 'staff',
          label: t('window.unit.peopleStaff'),
          people: details.workers,
          kind: 'staff',
        },
        {
          id: 'customers',
          label: t('window.unit.peopleCustomers'),
          people: details.customers,
          kind: 'customer',
        },
      ];
    case 'housekeeping':
      return [
        {
          id: 'maids',
          label: t('window.unit.peopleMaids'),
          people: details.workers ?? [],
          kind: 'maid',
        },
      ];
    case 'cleaning':
      return [
        {
          id: 'cleaners',
          label: t('window.unit.peopleCleaners'),
          people: details.workers,
          kind: 'cleaner',
        },
      ];
    case 'security':
      return [
        {
          id: 'officers',
          label: t('window.unit.peopleOfficers'),
          people: details.officers,
          kind: 'police',
        },
      ];
    case 'cinema': {
      const groups: PeopleGroup[] = [];
      if (details.workers && details.workers.length > 0) {
        groups.push({
          id: 'staff',
          label: t('window.unit.peopleStaff'),
          people: details.workers,
          kind: 'staff',
        });
      }
      groups.push({
        id: 'audience',
        label: t('window.unit.peopleAudience'),
        people: details.customers ?? [],
        kind: 'audience',
      });
      return groups;
    }
    case 'visit':
      return [
        unit.type === 'medical-center'
          ? {
              id: 'doctors',
              label: t('window.unit.peopleDoctors'),
              people: details.workers,
              kind: 'doctor',
            }
          : {
              id: 'staff',
              label: t('window.unit.peopleStaff'),
              people: details.workers,
              kind: 'staff',
            },
        {
          id: 'customers',
          label: t('window.unit.peopleCustomers'),
          people: details.customers,
          kind: 'customer',
        },
      ];
    default:
      return [];
  }
}

/** Opening and closing hour after one of them moved: the close stays at least an hour after the open. */
export function clampHours(
  open: number,
  close: number,
  moved: 'open' | 'close',
): { open: number; close: number } {
  let nextOpen = Math.min(23, Math.max(0, Math.round(open)));
  let nextClose = Math.min(24, Math.max(1, Math.round(close)));
  if (nextClose <= nextOpen) {
    if (moved === 'open') {
      nextOpen = nextClose - 1;
    } else {
      nextClose = nextOpen + 1;
    }
  }
  return { open: nextOpen, close: nextClose };
}

export function hourText(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export type EvaluationColor = 'sky-deep' | 'lamp' | 'cloth-red' | 'gray';

export interface EvaluationView {
  label: string;
  /** Color token of the Evaluación overlay. */
  color: EvaluationColor;
}

const EVALUATION_COLORS: Readonly<Record<Evaluation, EvaluationColor>> = {
  good: 'sky-deep',
  fair: 'lamp',
  poor: 'cloth-red',
};

export function evaluationView(evaluation: Evaluation | null): EvaluationView {
  if (evaluation === null) {
    return { label: t('value.evaluation.none'), color: 'gray' };
  }
  return {
    label: t(`value.evaluation.${evaluation}` as StringKey),
    color: EVALUATION_COLORS[evaluation],
  };
}

/** How a state value is colored: green is good, red is bad, yellow is in between. */
export type RowTone = 'good' | 'warn' | 'bad' | 'plain';

export interface UnitRow {
  id: string;
  label: string;
  value: string;
  tone: RowTone;
}

function weekdayName(weekday: number): string {
  return t(`calendar.weekday.${weekday}` as StringKey);
}

function weekdayAndTime(step: number): string {
  return t('window.unit.weekdayTime', {
    weekday: weekdayName(dateOfStep(step).weekday),
    time: formatGameTime(step),
  });
}

const EVALUATION_TONES: Readonly<Record<EvaluationColor, RowTone>> = {
  'sky-deep': 'good',
  lamp: 'warn',
  'cloth-red': 'bad',
  gray: 'plain',
};

function evaluationRow(evaluation: Evaluation | null): UnitRow {
  const view = evaluationView(evaluation);
  return {
    id: 'evaluation',
    label: t('window.unit.evaluation'),
    value: view.label,
    tone: EVALUATION_TONES[view.color],
  };
}

function appraisalRow(appraisal: number): UnitRow[] {
  return appraisal > 0
    ? [
        {
          id: 'appraisal',
          label: t('window.unit.appraisal'),
          value: formatMoney(appraisal),
          tone: 'plain',
        },
      ]
    : [];
}

function leaseRows(lease: Details<'lease'>, office: boolean): UnitRow[] {
  const leased = lease.state === 'occupied';
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(leased ? 'value.lease.occupied' : 'value.lease.forRent'),
      tone: leased ? 'good' : 'plain',
    },
    evaluationRow(lease.evaluation),
  ];
  if (!office && lease.nextPaymentStep !== null) {
    rows.push({
      id: 'nextPayment',
      label: t('window.unit.nextPayment'),
      value: weekdayAndTime(lease.nextPaymentStep),
      tone: 'plain',
    });
  }
  if (lease.weeklyRent !== null) {
    rows.push({
      id: 'weeklyRent',
      label: t('window.unit.weeklyRent'),
      value: formatMoney(lease.weeklyRent),
      tone: 'plain',
    });
  }
  return rows;
}

/** People are never counted in a panel: the row of people at the top lists them. */
function condoRows(condo: Details<'condo'>): UnitRow[] {
  return [evaluationRow(condo.evaluation), ...appraisalRow(condo.appraisal)];
}

const ROOM_STATE_KEYS: Readonly<Record<Details<'hotel'>['state'], StringKey>> = {
  clean: 'value.room.free',
  occupied: 'value.room.occupied',
  dirty: 'value.room.dirty',
  infested: 'value.room.infested',
};

const ROOM_STATE_TONES: Readonly<Record<Details<'hotel'>['state'], RowTone>> = {
  clean: 'plain',
  occupied: 'good',
  dirty: 'bad',
  infested: 'bad',
};

/** A hotel room shows its state and evaluation; the guests' check-out time is not shown. */
function hotelRows(hotel: Details<'hotel'>): UnitRow[] {
  return [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(ROOM_STATE_KEYS[hotel.state]),
      tone: ROOM_STATE_TONES[hotel.state],
    },
    evaluationRow(hotel.evaluation),
  ];
}

function cinemaRows(cinema: Details<'cinema'>): UnitRow[] {
  if (cinema.filmWeek === null || cinema.filmAgeDays === null) {
    return [];
  }
  const value = t('window.unit.filmAge', { w: cinema.filmWeek, age: cinema.filmAgeDays });
  return [{ id: 'film', label: t('window.unit.film'), value, tone: 'plain' }];
}

function housekeepingRows(housekeeping: Details<'housekeeping'>): UnitRow[] {
  return [
    {
      id: 'dirtyRooms',
      label: t('window.unit.dirtyRooms'),
      value: String(housekeeping.dirtyRooms),
      tone: 'plain',
    },
  ];
}

function venueRows(venue: Details<'venue'>): UnitRow[] {
  return [
    { id: 'served', label: t('window.unit.served'), value: String(venue.served), tone: 'plain' },
    {
      id: 'result',
      label: t('window.unit.resultToday'),
      value: formatMoney(venue.resultToday),
      tone: venue.resultToday > 0 ? 'good' : venue.resultToday < 0 ? 'bad' : 'plain',
    },
    {
      id: 'hours',
      label: t('window.unit.hours'),
      value: t('window.unit.hoursValue', {
        from: hourText(venue.opens),
        to: hourText(venue.closes),
      }),
      tone: 'plain',
    },
  ];
}

export interface VenueChart {
  width: number;
  height: number;
  /** SVG `points` of today's line; empty before the venue opens. */
  today: string;
  /** SVG `points` of the 7-day average line; empty before the first finished day. */
  average: string;
  /** Hour labels under the chart: the start and the end of the day. */
  from: string;
  to: string;
  /** The hours the venue is closed, as horizontal spans of the plot, drawn under a dark veil. */
  closed: readonly { x: number; width: number }[];
  /** Horizontal position of each point, the middle of its hour. */
  pointX: readonly number[];
  /** The largest value on the vertical axis. */
  max: number;
  /** The hour of the first point, and how many points the chart has (one per open hour). */
  startHour: number;
  hours: number;
  /** Customers per point, for the hover tip; today's list stops at the current hour. */
  todayValues: readonly number[];
  averageValues: readonly number[];
}

const CHART_WIDTH = 160;
const CHART_HEIGHT = 48;
const DAY_HOURS = 24;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Where an hour of the day falls across the plot: 00:00 on the left edge, 24:00 on the right. */
function hourX(hour: number): number {
  return round1((hour / DAY_HOURS) * CHART_WIDTH);
}

function linePoints(values: readonly number[], startHour: number, max: number): string {
  return values
    .map((value, index) => {
      const y = CHART_HEIGHT - (value / max) * CHART_HEIGHT;
      return `${hourX(startHour + index + 0.5)},${round1(y)}`;
    })
    .join(' ');
}

/**
 * The chart spans the whole day. Both lines share one vertical scale and have a point in the
 * middle of every open hour; the hours before the opening and after the closing are veiled.
 */
export function venueChart(venue: Details<'venue'>): VenueChart {
  const hours = Math.max(1, venue.closes - venue.opens);
  const max = Math.max(1, ...venue.today, ...venue.average);
  const opensX = hourX(venue.opens);
  const closesX = hourX(venue.closes);
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    today: linePoints(venue.today, venue.opens, max),
    average: linePoints(venue.average, venue.opens, max),
    from: hourText(0),
    to: hourText(DAY_HOURS),
    closed: [
      { x: 0, width: opensX },
      { x: closesX, width: round1(CHART_WIDTH - closesX) },
    ].filter((span) => span.width > 0),
    pointX: Array.from({ length: hours }, (_, index) => hourX(venue.opens + index + 0.5)),
    max,
    startHour: venue.opens,
    hours,
    todayValues: venue.today,
    averageValues: venue.average,
  };
}

function constructionRows(): UnitRow[] {
  return [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t('value.construction.inProgress'),
      tone: 'plain',
    },
  ];
}

function inServiceRows(): UnitRow[] {
  return [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t('value.service.active'),
      tone: 'good',
    },
  ];
}

function detailRows(details: InspectedUnitDetails, type: UnitType): UnitRow[] {
  switch (details.group) {
    case 'lease':
      return leaseRows(details, type === 'office');
    case 'condo':
      return condoRows(details);
    case 'hotel':
      return hotelRows(details);
    case 'cinema':
      return cinemaRows(details);
    case 'housekeeping':
      return housekeepingRows(details);
    case 'venue':
      return venueRows(details);
    case 'security':
      return inServiceRows();
    case 'visit':
    case 'cleaning':
      return [];
    case 'construction':
      return constructionRows();
  }
}

/** Rows below Nombre and Ubicacion. Types without details have none, or an in-service row. */
export function unitRows(unit: UnitInspect): UnitRow[] {
  if (unit.details !== null) {
    const rows = detailRows(unit.details, unit.type);
    // A fast food has the hours slider, so the plain hours row would say it twice.
    return unit.type === 'fast-food' ? rows.filter((row) => row.id !== 'hours') : rows;
  }
  return unit.type === 'security' || unit.type === 'subway-station' ? inServiceRows() : [];
}

export interface UnitRowGroups {
  /** State, occupancy and evaluation, drawn as stat tiles. */
  tiles: UnitRow[];
  /** Contract and next payment, drawn as chips. */
  chips: UnitRow[];
  rows: UnitRow[];
}

const TILE_IDS: readonly string[] = ['status', 'evaluation', 'served', 'result'];
const CHIP_IDS: readonly string[] = ['lease', 'nextPayment'];

export function groupUnitRows(rows: readonly UnitRow[]): UnitRowGroups {
  return {
    tiles: rows.filter((row) => TILE_IDS.includes(row.id)),
    chips: rows.filter((row) => CHIP_IDS.includes(row.id)),
    rows: rows.filter((row) => !TILE_IDS.includes(row.id) && !CHIP_IDS.includes(row.id)),
  };
}

export function unitSubtitle(unit: Pick<UnitInspect, 'type' | 'level'>): string {
  return t('window.unit.subtitle', {
    type: typeName(unit.type),
    level: levelText(unit.level),
  });
}

export interface UpgradeRow {
  id: string;
  label: string;
  /** "2/3": the level the unit has and the top level. */
  levelText: string;
  /** The price of the next level, or null at the top level. */
  priceText: string | null;
  /** True when the next level cannot be bought now: top level, or not enough money. */
  disabled: boolean;
  tooltip: string | undefined;
}

/** The upgrades the unit's type can buy, in catalog order; empty when it has none. */
export function upgradeRows(
  unit: Pick<UnitInspect, 'upgrades'>,
  money: number,
  gone: boolean,
): UpgradeRow[] {
  return (unit.upgrades ?? []).map((upgrade) => {
    const top = upgrade.nextPrice === null;
    const short = upgrade.nextPrice !== null && money < upgrade.nextPrice;
    return {
      id: upgrade.id,
      label: t(`window.unit.upgrade.${upgrade.id}` as StringKey),
      levelText: `${upgrade.level}/${upgrade.maxLevel}`,
      priceText: upgrade.nextPrice === null ? null : formatMoney(upgrade.nextPrice),
      disabled: gone || top || short,
      tooltip: short && !gone ? t('error.INSUFFICIENT_FUNDS') : undefined,
    };
  });
}

export interface FilmChangeState {
  disabled: boolean;
  tooltip: string | undefined;
}

export function filmChangeState(money: number, gone: boolean): FilmChangeState {
  if (gone) {
    return { disabled: true, tooltip: undefined };
  }
  const short = money < FILM_CHANGE_COST;
  return { disabled: short, tooltip: short ? t('error.INSUFFICIENT_FUNDS') : undefined };
}

type EvaluationPartsView = NonNullable<Details<'lease'>['evaluationParts']>;
type WorkerCause = NonNullable<EvaluationPartsView['mainCause']>;

/** Workers under this score raise the fair price: the neutral point of the fair price. */
const CALM_WORKERS_SCORE = 3;

const CAUSE_KEYS: Readonly<
  Record<Exclude<WorkerCause, 'calm' | 'walk' | 'surroundings'>, StringKey>
> = {
  wait: 'window.unit.reason.cause.wait',
  ride: 'window.unit.reason.cause.ride',
  stairs: 'window.unit.reason.cause.stairs',
  queue: 'window.unit.reason.cause.queue',
  noRoute: 'window.unit.reason.cause.noRoute',
};

export interface EvaluationReasons {
  good: string[];
  bad: string[];
}

/** The reasons as tooltip lines with no headings: each one in favor marked + in green, each one against marked - in red. */
export function reasonLines(reasons: EvaluationReasons): TooltipLine[] {
  return [
    ...reasons.good.map((reason) => ({ text: `+ ${reason}`, tone: 'good' as const })),
    ...reasons.bad.map((reason) => ({ text: `- ${reason}`, tone: 'bad' as const })),
  ];
}

/** What each evaluated unit says when its price is over the fair price, and when it is too far. */
const UNIT_WORDS: Readonly<
  Partial<Record<UnitInspect['type'], { dear: StringKey; far: StringKey }>>
> = {
  office: { dear: 'window.unit.reason.dear.rent', far: 'window.unit.reason.far.office' },
  'retail-shop': { dear: 'window.unit.reason.dear.rent', far: 'window.unit.reason.far.shop' },
  condo: { dear: 'window.unit.reason.dear.sale', far: 'window.unit.reason.far.condo' },
  'single-room': { dear: 'window.unit.reason.dear.rate', far: 'window.unit.reason.far.room' },
  'double-room': { dear: 'window.unit.reason.dear.rate', far: 'window.unit.reason.far.room' },
  suite: { dear: 'window.unit.reason.dear.rate', far: 'window.unit.reason.far.room' },
};

/** The main cause of the occupants' stress, said as what is wrong with the place. */
function causeText(parts: EvaluationPartsView, far: StringKey): string {
  const cause = parts.mainCause;
  if (cause === null || cause === 'calm') return t('window.unit.reason.stressful');
  if (cause === 'walk') return t(far);
  if (cause === 'surroundings') {
    return t(parts.noisy ? 'window.unit.reason.cause.noise' : 'window.unit.reason.cause.dirt');
  }
  return t(CAUSE_KEYS[cause]);
}

/**
 * Why a unit has its grade, as what is good or bad about the place: a price over the fair price,
 * calm or the main cause of the occupants' stress, and the parking its people ask for
 * (stress-evaluation 5.6). A fair price and a worse neighbor are not listed. Null when the inspect
 * has no parts.
 */
export function evaluationReasons(
  unit: Pick<UnitInspect, 'type' | 'details'>,
): EvaluationReasons | null {
  const details = unit.details;
  const words = UNIT_WORDS[unit.type];
  if (
    words === undefined ||
    (details?.group !== 'lease' && details?.group !== 'condo' && details?.group !== 'hotel') ||
    details.evaluationParts === undefined
  ) {
    return null;
  }
  const parts = details.evaluationParts;
  const good: string[] = [];
  const bad: string[] = [];
  if (details.price > parts.fairPrice) bad.push(t(words.dear));
  if (parts.occupantScore < CALM_WORKERS_SCORE) good.push(t('window.unit.reason.calm'));
  else bad.push(causeText(parts, words.far));
  if (parts.parking === 'has') good.push(t('window.unit.reason.parking'));
  else if (parts.parking === 'missing') bad.push(t('window.unit.reason.noParking'));
  return { good, bad };
}
