import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { SpriteRegistry, createPlaceholderTexture, spriteVariantId } from './spriteRegistry';

function registryWith(ids: string[]) {
  const placeholder = new Texture();
  const missing: string[] = [];
  const registry = new SpriteRegistry(placeholder, (id) => missing.push(id));
  const textures: Record<string, Texture> = {};
  for (const id of ids) {
    textures[id] = new Texture();
  }
  registry.addSheet(textures);
  return { registry, placeholder, textures, missing };
}

describe('spriteVariantId', () => {
  it('joins state, time and frame with underscores', () => {
    expect(spriteVariantId('units/office', { state: 'occupied', time: 'day' })).toBe(
      'units/office/occupied_day',
    );
    expect(spriteVariantId('people/worker-a', { state: 'walk-red', frame: 2 })).toBe(
      'people/worker-a/walk-red_02',
    );
    expect(spriteVariantId('structure/floor', { time: 'night' })).toBe('structure/floor/night');
  });

  it('returns the subject alone when no part applies', () => {
    expect(spriteVariantId('ui/tool-bulldozer', {})).toBe('ui/tool-bulldozer');
  });
});

describe('SpriteRegistry', () => {
  it('returns the registered texture for a known id', () => {
    const { registry, textures, missing } = registryWith(['structure/floor/day']);
    expect(registry.texture('structure/floor/day')).toBe(textures['structure/floor/day']);
    expect(registry.has('structure/floor/day')).toBe(true);
    expect(missing).toEqual([]);
  });

  it('looks up state variants', () => {
    const { registry, textures } = registryWith(['units/office/empty_night']);
    expect(registry.variant('units/office', { state: 'empty', time: 'night' })).toBe(
      textures['units/office/empty_night'],
    );
  });

  it('draws the placeholder for a missing id and reports it once', () => {
    const { registry, placeholder, missing } = registryWith([]);
    expect(registry.variant('units/office', { state: 'burnt' })).toBe(placeholder);
    expect(registry.variant('units/office', { state: 'burnt' })).toBe(placeholder);
    expect(registry.texture('sky/day/top')).toBe(placeholder);
    expect(missing).toEqual(['units/office/burnt', 'sky/day/top']);
  });

  it('refuses the same id from two atlases', () => {
    const { registry } = registryWith(['sky/day/top']);
    expect(() => registry.addSheet({ 'sky/day/top': new Texture() })).toThrow(
      'Sprite sky/day/top is in more than one atlas',
    );
  });

  it('warns on the console by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      new SpriteRegistry(new Texture()).variant('ui/nothing', {});
      expect(warn).toHaveBeenCalledWith(
        'Missing sprite "ui/nothing", drawing the placeholder instead',
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe('createPlaceholderTexture', () => {
  it('is one tile of solid magenta', () => {
    const texture = createPlaceholderTexture();
    expect(texture.width).toBe(TILE_WIDTH);
    expect(texture.height).toBe(FLOOR_HEIGHT);
    const pixels = texture.source.resource as Uint8Array;
    expect(pixels).toHaveLength(TILE_WIDTH * FLOOR_HEIGHT * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      expect([...pixels.subarray(offset, offset + 4)]).toEqual([255, 0, 255, 255]);
    }
  });
});
