import type { HeatData, HeatKind, TowerState } from '@tower-magnate/shared';

/** The level of a cell that is drawn at full strength, by map. */
export const HEAT_VIEW_MAX: Readonly<Record<HeatKind, number>> = { noise: 20, dirt: 5 };

/** Bytes a built cell can take above 0, which is kept for cells with no floor. */
const STEPS = 254;

/**
 * The heat map of a tower for drawing: a row for each level with floor, a byte per cell. A cell
 * with no floor is 0; a cell with floor is 1 with no heat, up to 255 at the map's max or more.
 */
export function buildHeatData(state: TowerState, kind: HeatKind): HeatData {
  const max = HEAT_VIEW_MAX[kind];
  const rows = state.heat?.[kind] ?? {};
  const levels: Record<string, number[]> = {};
  for (const [level, grid] of Object.entries(state.grid?.levels ?? {})) {
    if (!grid || grid.structure.length === 0) continue;
    const heat = rows[level];
    const bytes: number[] = [];
    for (const span of grid.structure) {
      for (let column = Math.max(0, span.x0); column <= span.x1; column++) {
        while (bytes.length < column) bytes.push(0);
        const value = heat?.[column] ?? 0;
        bytes[column] = 1 + Math.min(STEPS, Math.round((value / max) * STEPS));
      }
    }
    levels[level] = bytes;
  }
  return { kind, step: state.step, max, levels };
}
