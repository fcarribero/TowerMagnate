import { dateOfStep } from '@tower-magnate/engine/calendar';
import {
  CONDO_SALE_PRICE,
  HOTEL_NIGHTLY_PRICE,
  PRICE_LEVELS,
  WEEKLY_RENT,
  type Evaluation,
  type InspectedUnitDetails,
  type Level,
  type PriceLevel,
  type PriceTable,
  type UnitType,
} from '@tower-magnate/shared';
import type { UnitInspect } from '../../model/inspectStore';
import { formatMoney } from '../money';
import { formatGameTime } from '../status/statusFormat';
import { t, type StringKey } from '../strings';

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

export function locationText(unit: Pick<UnitInspect, 'level' | 'from' | 'to'>): string {
  return t('window.unit.locationValue', {
    level: levelText(unit.level),
    columns: t('ui.columns', { x0: unit.from, x1: unit.to }),
  });
}

export interface PriceOption {
  value: PriceLevel;
  /** Level name and amount together, the accessible name of the tile. */
  label: string;
  name: string;
  amount: string;
}

/** The price table a unit type charges from, or null when the type has no price choice. */
function priceTableOf(type: UnitType): PriceTable | null {
  if (type === 'office' || type === 'retail-shop') {
    return WEEKLY_RENT[type];
  }
  if (type === 'single-room' || type === 'double-room' || type === 'suite') {
    return HOTEL_NIGHTLY_PRICE[type];
  }
  return type === 'condo' ? CONDO_SALE_PRICE : null;
}

export function priceOptions(type: UnitType): PriceOption[] {
  const table = priceTableOf(type);
  if (table === null) {
    return [];
  }
  return PRICE_LEVELS.map((value) => {
    const name = t(`value.price.${value}` as StringKey);
    const amount = formatMoney(table[value]);
    return { value, label: `${name} ${amount}`, name, amount };
  });
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

/** The price level the server last sent, for the types that have a price choice. */
export function priceOf(unit: Pick<UnitInspect, 'details'>): PriceLevel | null {
  const { details } = unit;
  if (details === null || !('price' in details)) {
    return null;
  }
  return details.price;
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

function weekdayAndDay(step: number): string {
  const date = dateOfStep(step);
  return t('window.unit.nextEvaluationValue', {
    weekday: weekdayName(date.weekday),
    day: date.day,
    month: t(`calendar.month.${date.month}` as StringKey),
  });
}

function countOf(n: number, max: number): string {
  return t('window.unit.countOf', { n, max });
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

type Details<G extends InspectedUnitDetails['group']> = Extract<InspectedUnitDetails, { group: G }>;

function leaseRows(lease: Details<'lease'>): UnitRow[] {
  const leased = lease.state === 'occupied';
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(leased ? 'value.lease.occupied' : 'value.lease.forRent'),
      tone: leased ? 'good' : 'plain',
    },
    {
      id: 'people',
      label: t('window.unit.people'),
      value: countOf(lease.persons, lease.capacity),
      tone: 'plain',
    },
    evaluationRow(lease.evaluation),
    {
      id: 'lease',
      label: t('window.unit.lease'),
      value:
        leased && lease.leaseWeek !== null
          ? t('window.unit.leaseWeek', { k: lease.leaseWeek })
          : t('window.unit.noLease'),
      tone: 'plain',
    },
  ];
  if (lease.nextPaymentStep !== null) {
    rows.push({
      id: 'nextPayment',
      label: t('window.unit.nextPayment'),
      value: weekdayAndTime(lease.nextPaymentStep),
      tone: 'plain',
    });
  }
  return rows;
}

function condoRows(condo: Details<'condo'>): UnitRow[] {
  const sold = condo.state === 'sold';
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(sold ? 'value.condo.sold' : 'value.condo.forSale'),
      tone: sold ? 'good' : 'plain',
    },
    {
      id: 'residents',
      label: t('window.unit.residents'),
      value: countOf(condo.residents, condo.capacity),
      tone: 'plain',
    },
    evaluationRow(condo.evaluation),
  ];
  if (sold && condo.nextEvaluationStep !== null) {
    rows.push({
      id: 'nextEvaluation',
      label: t('window.unit.nextEvaluation'),
      value: weekdayAndDay(condo.nextEvaluationStep),
      tone: 'plain',
    });
  }
  return rows;
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

function hotelRows(hotel: Details<'hotel'>): UnitRow[] {
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(ROOM_STATE_KEYS[hotel.state]),
      tone: ROOM_STATE_TONES[hotel.state],
    },
    {
      id: 'guests',
      label: t('window.unit.guests'),
      value: countOf(hotel.guests, hotel.capacity),
      tone: 'plain',
    },
    evaluationRow(hotel.evaluation),
  ];
  if (hotel.state === 'occupied' && hotel.checkoutStep !== null) {
    rows.push({
      id: 'checkout',
      label: t('window.unit.checkout'),
      value: weekdayAndTime(hotel.checkoutStep),
      tone: 'plain',
    });
  }
  return rows;
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
      id: 'maidsWorking',
      label: t('window.unit.maidsWorking'),
      value: countOf(housekeeping.maidsWorking, housekeeping.maids),
      tone: 'plain',
    },
    {
      id: 'dirtyRooms',
      label: t('window.unit.dirtyRooms'),
      value: String(housekeeping.dirtyRooms),
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

function detailRows(details: InspectedUnitDetails): UnitRow[] {
  switch (details.group) {
    case 'lease':
      return leaseRows(details);
    case 'condo':
      return condoRows(details);
    case 'hotel':
      return hotelRows(details);
    case 'cinema':
      return cinemaRows(details);
    case 'housekeeping':
      return housekeepingRows(details);
  }
}

/** Rows below Nombre and Ubicacion. Types without details have none, or an in-service row. */
export function unitRows(unit: UnitInspect): UnitRow[] {
  if (unit.details !== null) {
    return detailRows(unit.details);
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

const TILE_IDS: readonly string[] = ['status', 'people', 'residents', 'guests', 'evaluation'];
const CHIP_IDS: readonly string[] = ['lease', 'nextPayment'];

export function groupUnitRows(rows: readonly UnitRow[]): UnitRowGroups {
  return {
    tiles: rows.filter((row) => TILE_IDS.includes(row.id)),
    chips: rows.filter((row) => CHIP_IDS.includes(row.id)),
    rows: rows.filter((row) => !TILE_IDS.includes(row.id) && !CHIP_IDS.includes(row.id)),
  };
}

export function unitSubtitle(unit: Pick<UnitInspect, 'type' | 'level' | 'from' | 'to'>): string {
  return t('window.unit.subtitle', {
    type: typeName(unit.type),
    level: levelText(unit.level),
    columns: t('ui.columns', { x0: unit.from, x1: unit.to }),
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
