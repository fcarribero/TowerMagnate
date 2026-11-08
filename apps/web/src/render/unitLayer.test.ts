import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SpriteRegistry } from './spriteRegistry';
import { levelToIndex, levelTop } from './levels';
import { UnitLayer } from './unitLayer';
import type { UnitSource } from './unitPlan';

function layerWith(ids: string[]) {
  const textures: Record<string, Texture> = {};
  for (const id of ids) {
    textures[id] = new Texture();
  }
  const missing: string[] = [];
  const placeholder = new Texture();
  const registry = new SpriteRegistry(placeholder, (id) => missing.push(id));
  registry.addSheet(textures);
  return { layer: new UnitLayer(registry), textures, placeholder, missing };
}

const office: UnitSource = {
  id: 'u1',
  type: 'office',
  x: 4,
  level: 3,
  occupied: false,
  variant: 'empty',
};

function spriteOf(layer: UnitLayer) {
  const container = layer.view.children[0];
  return container?.children[0];
}

describe('UnitLayer', () => {
  const ids = ['units/office/empty_day', 'units/office/occupied_day', 'units/office/empty_night'];

  it('draws a unit and swaps its texture when the variant or the time changes', () => {
    const { layer, textures } = layerWith(ids);
    layer.update({ units: [office], transports: [], time: 'day' });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/empty_day'] });

    layer.update({
      units: [{ ...office, occupied: true, variant: 'occupied' }],
      transports: [],
      time: 'day',
    });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/occupied_day'] });

    layer.update({ units: [office], transports: [], time: 'night' });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/empty_night'] });
    expect(layer.count).toBe(1);
  });

  it('draws the placeholder at the footprint size when the art is missing', () => {
    const { layer, placeholder, missing } = layerWith([]);
    layer.update({ units: [office], transports: [], time: 'day' });
    expect(spriteOf(layer)).toMatchObject({ texture: placeholder, height: 32 });
    expect(missing).toEqual(['units/office/empty_day']);
  });

  it('removes units that are no longer in the tower', () => {
    const { layer } = layerWith(ids);
    layer.update({ units: [office], transports: [], time: 'day' });
    layer.update({ units: [], transports: [], time: 'day' });
    expect(layer.count).toBe(0);
    expect(spriteOf(layer)).toBeUndefined();
  });

  it('reports the world rectangle each unit is drawn at and forgets removed units', () => {
    const { layer } = layerWith(ids);
    layer.update({ units: [office], transports: [], time: 'day' });
    const container = layer.view.children[0];
    const sprite = container?.children[0];
    expect(layer.rectOf('u1')).toEqual({
      x: sprite?.x,
      y: (container?.y ?? 0) + (sprite?.y ?? 0),
      width: sprite?.width,
      height: sprite?.height,
    });
    expect(layer.rectOf('u1')?.y).toBe(levelTop(levelToIndex(3)));
    layer.update({ units: [], transports: [], time: 'day' });
    expect(layer.rectOf('u1')).toBeUndefined();
  });
});
