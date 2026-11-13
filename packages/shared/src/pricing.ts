import {
  APPRAISAL_RANGE_PERCENT,
  CONDO_SALE_PRICE,
  HOTEL_NIGHTLY_PRICE,
  PRICE_BAND_MARGIN_PERCENT,
  PRICE_BOUNDS_PERCENT,
  WEEKLY_RENT,
} from './balance';
import type { PriceLevel, PriceTable, UnitType } from './units';

export type PriceBand = 'low' | 'normal' | 'high';

/**
 * The old four-level price table of a unit type: weekly rent, condo sale price or nightly rate.
 * Its "normal" value is the base the appraisal and the price bounds start from.
 */
export function basePriceTable(type: UnitType): PriceTable | null {
  if (type === 'condo') return CONDO_SALE_PRICE;
  if (Object.hasOwn(WEEKLY_RENT, type)) return WEEKLY_RENT[type as keyof typeof WEEKLY_RENT];
  if (Object.hasOwn(HOTEL_NIGHTLY_PRICE, type)) {
    return HOTEL_NIGHTLY_PRICE[type as keyof typeof HOTEL_NIGHTLY_PRICE];
  }
  return null;
}

export function isPricedType(type: UnitType): boolean {
  return basePriceTable(type) !== null;
}

/** The base ("normal") price of a priced unit type; 0 for a type with no price. */
export function basePrice(type: UnitType): number {
  return basePriceTable(type)?.normal ?? 0;
}

/** Old price level to money, for saves that stored a level. */
export function priceOfLevel(type: UnitType, level: PriceLevel): number {
  return basePriceTable(type)?.[level] ?? 0;
}

/** The cheapest and dearest whole price a player can set on a unit of this type. */
export function priceBounds(unit: { type: UnitType }): { min: number; max: number } {
  const base = basePrice(unit.type);
  return {
    min: Math.max(1, Math.round((base * PRICE_BOUNDS_PERCENT.min) / 100)),
    max: Math.round((base * PRICE_BOUNDS_PERCENT.max) / 100),
  };
}

/** The range an appraisal is clamped to for this unit type. */
export function appraisalBounds(type: UnitType): { min: number; max: number } {
  const base = basePrice(type);
  return {
    min: Math.round((base * APPRAISAL_RANGE_PERCENT.min) / 100),
    max: Math.round((base * APPRAISAL_RANGE_PERCENT.max) / 100),
  };
}

/** Low below 95% of the appraisal, high above 105%, normal in between. */
export function priceBand(price: number, appraisal: number): PriceBand {
  const margin = PRICE_BAND_MARGIN_PERCENT / 100;
  if (price < appraisal * (1 - margin)) return 'low';
  if (price > appraisal * (1 + margin)) return 'high';
  return 'normal';
}
