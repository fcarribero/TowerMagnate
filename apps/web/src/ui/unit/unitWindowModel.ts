import { dateOfStep } from '@tower-magnate/engine/calendar';
import {
  CONDO_SALE_PRICE,
  HOTEL_NIGHTLY_PRICE,
  PRICE_LEVELS,
  UNIT_CATALOG,
  WEEKLY_RENT,
  type Evaluation,
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
const DAYS_PER_WEEK = 7;

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

export function locationText(unit: Pick<UnitInspect, 'type' | 'level' | 'x'>): string {
  const lastColumn = unit.x + UNIT_CATALOG[unit.type].width - 1;
  return t('window.unit.locationValue', {
    level: levelText(unit.level),
    columns: t('ui.columns', { x0: unit.x, x1: lastColumn }),
  });
}

export interface PriceOption {
  value: PriceLevel;
  label: string;
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
  return PRICE_LEVELS.map((value) => ({
    value,
    label: `${t(`value.price.${value}` as StringKey)} ${formatMoney(table[value])}`,
  }));
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

export function isSoldCondo(unit: Pick<UnitInspect, 'type' | 'contract'>): boolean {
  return unit.type === 'condo' && unit.contract?.state === 'sold';
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

export interface UnitRow {
  id: string;
  label: string;
  value: string;
  /** Set on the evaluation row, which draws a color square beside the word. */
  evaluationColor?: EvaluationColor;
}

export interface UnitRowContext {
  /** The unit's drawn variant; hotel rooms read their state from it. */
  variant: string | undefined;
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

function evaluationRow(unit: UnitInspect): UnitRow {
  const view = evaluationView(unit.evaluation);
  return {
    id: 'evaluation',
    label: t('window.unit.evaluation'),
    value: view.label,
    evaluationColor: view.color,
  };
}

function leaseRows(unit: UnitInspect): UnitRow[] {
  const { contract } = unit;
  const leased = contract?.state === 'leased';
  const week = contract?.week ?? null;
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(leased ? 'value.lease.occupied' : 'value.lease.forRent'),
    },
    { id: 'people', label: t('window.unit.people'), value: countOf(unit.occupants, unit.capacity) },
    evaluationRow(unit),
    {
      id: 'lease',
      label: t('window.unit.lease'),
      value:
        leased && week !== null
          ? t('window.unit.leaseWeek', { k: week })
          : t('window.unit.noLease'),
    },
  ];
  if (contract?.nextPaymentStep != null) {
    rows.push({
      id: 'nextPayment',
      label: t('window.unit.nextPayment'),
      value: weekdayAndTime(contract.nextPaymentStep),
    });
  }
  return rows;
}

function condoRows(unit: UnitInspect): UnitRow[] {
  const sold = isSoldCondo(unit);
  const rows: UnitRow[] = [
    {
      id: 'status',
      label: t('window.unit.status'),
      value: t(sold ? 'value.condo.sold' : 'value.condo.forSale'),
    },
    {
      id: 'residents',
      label: t('window.unit.residents'),
      value: countOf(unit.occupants, unit.capacity),
    },
    evaluationRow(unit),
  ];
  if (sold && unit.contract?.nextPaymentStep != null) {
    rows.push({
      id: 'nextEvaluation',
      label: t('window.unit.nextEvaluation'),
      value: weekdayAndDay(unit.contract.nextPaymentStep),
    });
  }
  return rows;
}

function roomStateKey(unit: UnitInspect, context: UnitRowContext): StringKey {
  if (unit.occupants > 0) {
    return 'value.room.occupied';
  }
  if (context.variant === 'dirty') {
    return 'value.room.dirty';
  }
  return context.variant === 'infested' ? 'value.room.infested' : 'value.room.free';
}

function hotelRows(unit: UnitInspect, context: UnitRowContext): UnitRow[] {
  const rows: UnitRow[] = [
    { id: 'status', label: t('window.unit.status'), value: t(roomStateKey(unit, context)) },
    { id: 'guests', label: t('window.unit.guests'), value: countOf(unit.occupants, unit.capacity) },
    evaluationRow(unit),
  ];
  if (unit.occupants > 0 && unit.hotelStayEndStep !== null) {
    rows.push({
      id: 'checkout',
      label: t('window.unit.checkout'),
      value: weekdayAndTime(unit.hotelStayEndStep),
    });
  }
  return rows;
}

/** Film weeks count from 1; a film starts at age 0. */
function filmText(filmAgeDays: number): string {
  return t('window.unit.filmAge', {
    w: Math.floor(filmAgeDays / DAYS_PER_WEEK) + 1,
    age: filmAgeDays,
  });
}

function cinemaRows(unit: UnitInspect): UnitRow[] {
  if (unit.filmAgeDays === null) {
    return [];
  }
  return [{ id: 'film', label: t('window.unit.film'), value: filmText(unit.filmAgeDays) }];
}

function inServiceRows(): UnitRow[] {
  return [{ id: 'status', label: t('window.unit.status'), value: t('value.service.active') }];
}

/** Rows below Nombre and Ubicación. Types whose data is not sent yet have none. */
export function unitRows(unit: UnitInspect, context: UnitRowContext): UnitRow[] {
  switch (unit.type) {
    case 'office':
    case 'retail-shop':
      return leaseRows(unit);
    case 'condo':
      return condoRows(unit);
    case 'single-room':
    case 'double-room':
    case 'suite':
      return hotelRows(unit, context);
    case 'cinema':
      return cinemaRows(unit);
    case 'security':
    case 'subway-station':
      return inServiceRows();
    default:
      return [];
  }
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
