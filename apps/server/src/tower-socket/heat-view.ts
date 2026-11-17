import type { HeatData, HeatKind, TowerState } from '@tower-magnate/shared';

/** The level of a cell that is drawn at full strength, by map. */
export const HEAT_VIEW_MAX: Readonly<Record<HeatKind, number>> = { noise: 20, dirt: 5 };

/** The heat map of a tower for drawing: a byte per cell, only the levels that have any heat. */
export function buildHeatData(state: TowerState, kind: HeatKind): HeatData {
  const max = HEAT_VIEW_MAX[kind];
  const rows = state.heat?.[kind] ?? {};
  const levels: Record<string, number[]> = {};
  for (const [level, row] of Object.entries(rows)) {
    const bytes = row.map((value) => Math.min(255, Math.round((value / max) * 255)));
    if (bytes.some((byte) => byte > 0)) levels[level] = bytes;
  }
  return { kind, step: state.step, max, levels };
}
