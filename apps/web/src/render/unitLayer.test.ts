import { UNIT_CATALOG } from '@tower-magnate/shared';
import { Texture, TilingSprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { SpriteRegistry } from './spriteRegistry';
import { levelToIndex, levelTop } from './levels';
import { UnitLayer } from './unitLayer';
import type { UnitSource } from './unitPlan';
import { ALL_VENUES_OPEN } from './venueHours';

vi.mock('./overlayChecker', () => ({ checkerTexture: () => new Texture() }));

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
  price: 'normal',
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
    layer.update({ units: [office], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/empty_day'] });

    layer.update({
      units: [{ ...office, occupied: true, variant: 'occupied' }],
      transports: [],
      time: 'day',
      openVenues: ALL_VENUES_OPEN,
    });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/occupied_day'] });

    layer.update({ units: [office], transports: [], time: 'night', openVenues: ALL_VENUES_OPEN });
    expect(spriteOf(layer)).toMatchObject({ texture: textures['units/office/empty_night'] });
    expect(layer.count).toBe(1);
  });

  it('draws the placeholder at the footprint size when the art is missing', () => {
    const { layer, placeholder, missing } = layerWith([]);
    layer.update({ units: [office], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    expect(spriteOf(layer)).toMatchObject({ texture: placeholder, height: 32 });
    expect(missing).toEqual(['units/office/empty_day']);
  });

  it('removes units that are no longer in the tower', () => {
    const { layer } = layerWith(ids);
    layer.update({ units: [office], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    layer.update({ units: [], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    expect(layer.count).toBe(0);
    expect(spriteOf(layer)).toBeUndefined();
  });

  it('reports the world rectangle each unit is drawn at and forgets removed units', () => {
    const { layer } = layerWith(ids);
    layer.update({ units: [office], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    const container = layer.view.children[0];
    const sprite = container?.children[0];
    expect(layer.rectOf('u1')).toEqual({
      x: sprite?.x,
      y: (container?.y ?? 0) + (sprite?.y ?? 0),
      width: sprite?.width,
      height: sprite?.height,
    });
    expect(layer.rectOf('u1')?.y).toBe(levelTop(levelToIndex(3)));
    layer.update({ units: [], transports: [], time: 'day', openVenues: ALL_VENUES_OPEN });
    expect(layer.rectOf('u1')).toBeUndefined();
  });

  it('draws a checker over a unit under an overlay and removes it in Normal', () => {
    const { layer } = layerWith(ids);
    const data = { evaluation: {}, price: {}, hotel: {} };
    layer.update({
      units: [office],
      transports: [],
      time: 'day',
      openVenues: ALL_VENUES_OPEN,
      overlay: { id: 'price', data },
    });
    const container = layer.view.children[0];
    expect(container?.children).toHaveLength(2);
    expect(container?.children[1]).toBeInstanceOf(TilingSprite);
    expect(container?.children[1]).toMatchObject({
      width: UNIT_CATALOG.office.width * TILE_WIDTH,
      height: FLOOR_HEIGHT,
    });

    layer.update({
      units: [office],
      transports: [],
      time: 'day',
      openVenues: ALL_VENUES_OPEN,
      overlay: { id: 'normal', data },
    });
    expect(container?.children).toHaveLength(1);
  });

  it('covers stairs with a checker under any overlay but Normal', () => {
    const { layer } = layerWith(['transport/stairs/empty_day', 'transport/stairs/day']);
    const data = { evaluation: {}, price: {}, hotel: {} };
    const stairs = { id: 's1', type: 'stairs', x: 0, level: 2 } as const;
    layer.update({
      units: [],
      transports: [stairs],
      time: 'day',
      openVenues: ALL_VENUES_OPEN,
      overlay: { id: 'hotel', data },
    });
    expect(layer.view.children[0]?.children.some((c) => c instanceof TilingSprite)).toBe(true);
  });
});
