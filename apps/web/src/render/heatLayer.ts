import type { HeatData } from '@tower-magnate/shared';
import { Container, Graphics } from 'pixi.js';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';

/** Steps of the colour ramp; cells in the same step are drawn as one run. */
export const HEAT_BANDS = 16;
const HEAT_ALPHA = 0.6;

/** Green for little, yellow in the middle, red for a lot. `band` runs from 1 to HEAT_BANDS. */
export function heatColor(band: number): number {
  const t = (band - 1) / (HEAT_BANDS - 1);
  const channel = (from: number, to: number, share: number): number =>
    Math.round(from + (to - from) * share);
  if (t < 0.5) {
    const share = t / 0.5;
    return (
      (channel(0x7e, 0xf2, share) << 16) |
      (channel(0xc8, 0xd3, share) << 8) |
      channel(0x50, 0x6b, share)
    );
  }
  const share = (t - 0.5) / 0.5;
  return (
    (channel(0xf2, 0xb0, share) << 16) |
    (channel(0xd3, 0x35, share) << 8) |
    channel(0x6b, 0x3a, share)
  );
}

/** The band of a cell byte: 0 for none, 1 to HEAT_BANDS from faint to full. */
export function bandOf(byte: number): number {
  return byte <= 0 ? 0 : Math.min(HEAT_BANDS, Math.ceil((byte / 255) * HEAT_BANDS));
}

/** A run of cells of one band on one level. */
export interface HeatRun {
  level: number;
  from: number;
  to: number;
  band: number;
}

/** Merges neighbouring cells of the same band into runs, so a floor takes a few rectangles. */
export function heatRuns(data: HeatData): HeatRun[] {
  const runs: HeatRun[] = [];
  for (const [key, row] of Object.entries(data.levels)) {
    const level = Number(key);
    let start = 0;
    let band = bandOf(row[0] ?? 0);
    for (let column = 1; column <= row.length; column++) {
      const next = column < row.length ? bandOf(row[column] ?? 0) : -1;
      if (next === band) continue;
      if (band > 0) runs.push({ level, from: start, to: column - 1, band });
      start = column;
      band = next;
    }
  }
  return runs;
}

/** The noise or dirt of every cell, drawn over the tower while the player looks at that map. */
export class HeatLayer {
  readonly view = new Container();
  private readonly shape = new Graphics();

  constructor() {
    this.view.addChild(this.shape);
    this.view.visible = false;
  }

  show(data: HeatData | null): void {
    this.shape.clear();
    this.view.visible = data !== null;
    if (data === null) return;
    for (const run of heatRuns(data)) {
      const top = levelTop(levelToIndex(run.level));
      this.shape
        .rect(run.from * TILE_WIDTH, top, (run.to - run.from + 1) * TILE_WIDTH, FLOOR_HEIGHT)
        .fill({ color: heatColor(run.band), alpha: HEAT_ALPHA });
    }
  }
}
