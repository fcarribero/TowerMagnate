import {
  basePriceTable,
  type PriceLevel,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';

/** Price over appraisal; 1 when the unit has no appraisal yet. */
export function priceRatio(unit: Pick<Unit, 'price' | 'appraisal'>): number {
  return unit.appraisal > 0 ? unit.price / unit.appraisal : 1;
}

/**
 * Where the four old price levels sit as a ratio of the unit type's "normal" price. A price at
 * the appraisal of a base-priced tower has the ratio 1.
 */
export function levelRatio(type: UnitType, level: PriceLevel): number {
  const table = basePriceTable(type);
  return table ? table[level] / table.normal : 1;
}

const ASCENDING: readonly PriceLevel[] = ['minimum', 'low', 'normal', 'high'];

/**
 * A value the old design gave to each price level, worked out for any price. It follows the
 * four old values in a straight line between their ratios and stays flat beyond the ends, so
 * the four old prices still give exactly the old values.
 */
export function byPriceRatio(
  type: UnitType,
  values: Readonly<Record<PriceLevel, number>>,
  ratio: number,
): number {
  const levels = ASCENDING;
  const first = levels[0] as PriceLevel;
  const last = levels[levels.length - 1] as PriceLevel;
  if (ratio <= levelRatio(type, first)) return values[first];
  if (ratio >= levelRatio(type, last)) return values[last];
  for (let index = 1; index < levels.length; index++) {
    const upper = levels[index] as PriceLevel;
    const lower = levels[index - 1] as PriceLevel;
    const to = levelRatio(type, upper);
    const from = levelRatio(type, lower);
    if (ratio <= to) {
      const share = (ratio - from) / (to - from);
      return values[lower] + (values[upper] - values[lower]) * share;
    }
  }
  return values[last];
}
