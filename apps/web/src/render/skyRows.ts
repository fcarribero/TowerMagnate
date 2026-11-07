import { TilingSprite } from 'pixi.js';
import { HIGHEST_LEVEL, WORLD_WIDTH, levelToIndex } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import type { SpriteRegistry } from './spriteRegistry';

export type SkyBand = 'horizon' | 'middle' | 'top';

const HORIZON_TOP_LEVEL = 5;
const TOP_BAND_LOWEST_LEVEL = 90;

/** Sky band behind an above-ground level: pale near the ground, deep at the top. */
export function skyBandForLevel(level: number): SkyBand {
  if (level <= HORIZON_TOP_LEVEL) {
    return 'horizon';
  }
  if (level >= TOP_BAND_LOWEST_LEVEL) {
    return 'top';
  }
  return 'middle';
}

export function skySpriteId(level: number): string {
  return `sky/day/${skyBandForLevel(level)}`;
}

/** One full-width row of day sky per above-ground level, keyed by dense level index. */
export function createSkyRows(sprites: SpriteRegistry): Map<number, TilingSprite> {
  const rows = new Map<number, TilingSprite>();
  for (let level = 1; level <= HIGHEST_LEVEL; level += 1) {
    const row = new TilingSprite({
      texture: sprites.texture(skySpriteId(level)),
      width: WORLD_WIDTH,
      height: FLOOR_HEIGHT,
    });
    rows.set(levelToIndex(level), row);
  }
  return rows;
}
