import {
  COMFORT_AURA,
  LAST_COLUMN,
  LIBRARY_NOISE_KEEP,
  UNIT_CATALOG,
  type TowerState,
} from '@tower-magnate/shared';

/**
 * The calm of the gardens, lounges and libraries of a tower (service-units 3), as a factor per cell:
 * 1 where no such unit is near, less near one. Libraries also have a factor for the noise they take
 * out of their cells each minute.
 */
export interface ComfortCells {
  /** Stress factor per cell, by level; a level with no comfort unit near has no row. */
  calm: Map<number, Float32Array>;
  /** Share of the noise kept each minute, by level; only the levels of libraries. */
  noiseKeep: Map<number, Float32Array>;
}

const COLUMNS = LAST_COLUMN + 1;
const STEPS_PER_MINUTE = 6;
/** A unit removed in a record that was already copied is caught within this many game minutes. */
const REFRESH_MINUTES = 10;
const NONE: ComfortCells = { calm: new Map(), noiseKeep: new Map() };

function rowOf(rows: Map<number, Float32Array>, level: number): Float32Array {
  let row = rows.get(level);
  if (!row) {
    row = new Float32Array(COLUMNS).fill(1);
    rows.set(level, row);
  }
  return row;
}

/**
 * Lowers `row` to `factor` from `from` to `to`, and on each side over `fade` columns to a factor that
 * rises in a straight line back to 1. Where two units overlap the lower factor counts.
 */
function lowerWithFade(row: Float32Array, from: number, to: number, factor: number, fade: number) {
  const lower = (column: number, value: number): void => {
    if (column < 0 || column > LAST_COLUMN) return;
    if (value < (row[column] as number)) row[column] = value;
  };
  for (let column = from; column <= to; column++) lower(column, factor);
  for (let d = 1; d <= fade; d++) {
    const value = factor + (1 - factor) * (d / (fade + 1));
    lower(from - d, value);
    lower(to + d, value);
  }
}

export function buildComfortCells(state: TowerState): ComfortCells {
  let cells: ComfortCells | null = null;
  for (const unit of Object.values(state.units)) {
    const aura = COMFORT_AURA[unit.type];
    if (!aura) continue;
    cells ??= { calm: new Map(), noiseKeep: new Map() };
    const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
    lowerWithFade(rowOf(cells.calm, unit.level), unit.x, last, aura.calm, aura.cells);
    if (unit.type === 'library') {
      lowerWithFade(
        rowOf(cells.noiseKeep, unit.level),
        unit.x,
        last,
        LIBRARY_NOISE_KEEP,
        aura.cells,
      );
    }
  }
  return cells ?? NONE;
}

const memo = new WeakMap<
  TowerState['units'],
  { nextId: number; minute: number; cells: ComfortCells }
>();

/**
 * The comfort cells of the tower. They are worked out again for a new units record, when a unit was
 * added, and every few game minutes, which catches a unit demolished in a record already copied.
 */
export function comfortCellsOf(state: TowerState): ComfortCells {
  // A bare state made for a test may have no units at all.
  if (!state.units) return NONE;
  const minute = Math.floor(state.step / STEPS_PER_MINUTE);
  const kept = memo.get(state.units);
  if (
    kept &&
    kept.nextId === state.nextId &&
    minute >= kept.minute &&
    minute - kept.minute < REFRESH_MINUTES
  ) {
    return kept.cells;
  }
  const cells = buildComfortCells(state);
  memo.set(state.units, { nextId: state.nextId, minute, cells });
  return cells;
}

/** The factor on the stress felt in a cell: 1 unless a garden, lounge or library is near. */
export function calmAt(state: TowerState, level: number, column: number): number {
  const { calm } = comfortCellsOf(state);
  if (calm.size === 0) return 1;
  return calm.get(level)?.[column] ?? 1;
}

/** Once a game minute each library takes a share of the noise out of the cells around it. */
export function absorbNoise(state: TowerState, noise: Record<string, number[]>): void {
  const { noiseKeep } = comfortCellsOf(state);
  for (const [level, keep] of noiseKeep) {
    const row = noise[level];
    if (!row) continue;
    for (let column = 0; column < row.length; column++) {
      const factor = keep[column] as number;
      if (factor < 1) row[column] = (row[column] as number) * factor;
    }
  }
}
