import { TilingSprite } from 'pixi.js';
import type { SpriteId } from './atlasManifest';
import { HIGHEST_LEVEL, WORLD_WIDTH, indexToLevel, levelToIndex } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import type { SkyTime } from './timeOfDay';
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

export function skySpriteId(level: number, time: SkyTime = 'day'): SpriteId {
  return `sky/${time}/${skyBandForLevel(level)}`;
}

/** Colour behind the sky rows, so the gaps between rows match the time of day. */
export const SKY_BACKGROUND: Record<SkyTime, string> = {
  day: '#6f9fd8',
  dusk: '#e0875a',
  night: '#23305e',
};

/** One full-width row of day sky per above-ground level, keyed by dense level index. */
export function createSkyRows(
  sprites: SpriteRegistry,
  time: SkyTime = 'day',
): Map<number, TilingSprite> {
  const rows = new Map<number, TilingSprite>();
  for (let level = 1; level <= HIGHEST_LEVEL; level += 1) {
    const row = new TilingSprite({
      texture: sprites.texture(skySpriteId(level, time)),
      width: WORLD_WIDTH,
      height: FLOOR_HEIGHT,
    });
    rows.set(levelToIndex(level), row);
  }
  return rows;
}

/** Swaps every row to the sky of `time`; rows already showing it are left alone. */
export function setSkyTime(
  rows: Map<number, TilingSprite>,
  sprites: SpriteRegistry,
  time: SkyTime,
): void {
  for (const [index, row] of rows) {
    const texture = sprites.texture(skySpriteId(indexToLevel(index), time));
    if (row.texture !== texture) {
      row.texture = texture;
    }
  }
}
