import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { HIGHEST_LEVEL, levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';
import {
  createSkyRows,
  setSkyTime,
  showSkyRows,
  skyBandForLevel,
  skySpans,
  skySpriteId,
} from './skyRows';
import { SpriteRegistry } from './spriteRegistry';

describe('skyBandForLevel', () => {
  it('is pale near the ground and deep at the top', () => {
    expect(skyBandForLevel(1)).toBe('horizon');
    expect(skyBandForLevel(5)).toBe('horizon');
    expect(skyBandForLevel(6)).toBe('middle');
    expect(skyBandForLevel(89)).toBe('middle');
    expect(skyBandForLevel(90)).toBe('top');
    expect(skyBandForLevel(104)).toBe('top');
  });

  it('names a day sky sprite', () => {
    expect(skySpriteId(50)).toBe('sky/day/middle');
    expect(skySpriteId(50, 'dusk')).toBe('sky/dusk/middle');
    expect(skySpriteId(1, 'night')).toBe('sky/night/horizon');
  });
});

describe('sky bands', () => {
  function rowsWithArt() {
    const textures: Record<string, Texture> = {};
    for (const time of ['day', 'night'] as const) {
      for (const band of ['horizon', 'middle', 'top'] as const) {
        textures[`sky/${time}/${band}`] = new Texture();
      }
    }
    const registry = new SpriteRegistry(new Texture(), () => undefined);
    registry.addSheet(textures);
    return { rows: createSkyRows(registry), registry, textures };
  }

  it('groups the above-ground levels into one span per band', () => {
    expect(skySpans()).toEqual([
      { band: 'horizon', lowestLevel: 1, highestLevel: 5 },
      { band: 'middle', lowestLevel: 6, highestLevel: 89 },
      { band: 'top', lowestLevel: 90, highestLevel: HIGHEST_LEVEL },
    ]);
  });

  it('covers each span with one sprite aligned to its levels', () => {
    const middle = rowsWithArt().rows.find((row) => row.span.band === 'middle');
    if (middle === undefined) {
      throw new Error('no middle band');
    }
    expect(middle.sprite.height).toBe(84 * FLOOR_HEIGHT);
    expect(middle.sprite.y).toBe(levelTop(levelToIndex(89)));
    expect(middle.sprite.y + middle.sprite.height).toBe(levelTop(levelToIndex(6)) + FLOOR_HEIGHT);
  });

  it('shows only the bands with a level on screen', () => {
    const { rows } = rowsWithArt();
    showSkyRows(rows, { lowest: levelToIndex(40), highest: levelToIndex(73) });
    expect(rows.map((row) => row.sprite.visible)).toEqual([false, true, false]);
    showSkyRows(rows, { lowest: levelToIndex(-3), highest: levelToIndex(6) });
    expect(rows.map((row) => row.sprite.visible)).toEqual([true, true, false]);
  });

  it('swaps every band to the night sky', () => {
    const { rows, registry, textures } = rowsWithArt();
    setSkyTime(rows, registry, 'night');
    expect(rows.map((row) => row.sprite.texture)).toEqual([
      textures['sky/night/horizon'],
      textures['sky/night/middle'],
      textures['sky/night/top'],
    ]);
  });
});
