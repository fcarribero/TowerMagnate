import { TilingSprite } from 'pixi.js';
import type { SpriteId } from './atlasManifest';
import type { LevelRange } from './camera';
import { HIGHEST_LEVEL, WORLD_WIDTH, levelToIndex, levelTop } from './levels';
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

export interface SkySpan {
  band: SkyBand;
  lowestLevel: number;
  highestLevel: number;
}

/** Runs of consecutive above-ground levels that share a sky band, from the ground up. */
export function skySpans(): SkySpan[] {
  const spans: SkySpan[] = [];
  for (let level = 1; level <= HIGHEST_LEVEL; level += 1) {
    const band = skyBandForLevel(level);
    const current = spans[spans.length - 1];
    if (current !== undefined && current.band === band) {
      current.highestLevel = level;
    } else {
      spans.push({ band, lowestLevel: level, highestLevel: level });
    }
  }
  return spans;
}

export interface SkyRow {
  span: SkySpan;
  sprite: TilingSprite;
}

/**
 * One tall tiling sprite per sky band. The sky texture is one floor high, so
 * it repeats level by level, and a band costs one draw call however many of
 * its levels are on screen.
 */
export function createSkyRows(sprites: SpriteRegistry, time: SkyTime = 'day'): SkyRow[] {
  return skySpans().map((span) => {
    const levels = span.highestLevel - span.lowestLevel + 1;
    const sprite = new TilingSprite({
      texture: sprites.texture(skySpriteId(span.lowestLevel, time)),
      width: WORLD_WIDTH,
      height: levels * FLOOR_HEIGHT,
    });
    sprite.y = levelTop(levelToIndex(span.highestLevel));
    return { span, sprite };
  });
}

/** Shows only the bands that have at least one level in the dense index range. */
export function showSkyRows(rows: SkyRow[], range: LevelRange): void {
  for (const { span, sprite } of rows) {
    const lowestIndex = levelToIndex(span.lowestLevel);
    const highestIndex = levelToIndex(span.highestLevel);
    sprite.visible = highestIndex >= range.lowest && lowestIndex <= range.highest;
  }
}

/** Swaps every band to the sky of `time`; bands already showing it are left alone. */
export function setSkyTime(rows: SkyRow[], sprites: SpriteRegistry, time: SkyTime): void {
  for (const { span, sprite } of rows) {
    const texture = sprites.texture(skySpriteId(span.lowestLevel, time));
    if (sprite.texture !== texture) {
      sprite.texture = texture;
    }
  }
}
