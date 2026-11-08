import type { PersonView, ShaftView } from '@tower-magnate/shared';
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { DrawnFrame } from '../model/interpolation';
import { car, shaft as fixtureShaft, walker } from '../testing/protocolFixtures';
import { ElevatorLayer } from './elevatorLayer';
import { levelToIndex } from './levels';
import { SpriteRegistry } from './spriteRegistry';

const SPRITES = [
  'transport/standard-shaft/body',
  'transport/standard-shaft/top',
  'transport/standard-shaft/bottom',
  'transport/standard-shaft/landing',
  'transport/standard-car/open',
  'transport/standard-car/closed',
  'people/worker-b/stand',
  'people/worker-b/stand-pink',
];

function layerWithArt() {
  const textures: Record<string, Texture> = {};
  for (const id of SPRITES) {
    textures[id] = new Texture();
  }
  const missing: string[] = [];
  const registry = new SpriteRegistry(new Texture(), (id) => missing.push(id));
  registry.addSheet(textures);
  return { layer: new ElevatorLayer(registry), textures, missing };
}

const shaft: ShaftView = { ...fixtureShaft, bottom: 1, top: 3, stops: [1, 3] };
const shafts = new Map([[shaft.id, shaft]]);

function frameOf(
  position: number,
  doors: 'open' | 'closed',
  riders: PersonView[] = [],
): DrawnFrame {
  const drawnCar = { key: 's4#0', car: { ...car, doors }, position };
  return {
    cars: new Map([['s4#0', drawnCar]]),
    people: riders.map((person) => ({ person, x: shaft.x, position })),
  };
}

const rider: PersonView = {
  ...walker,
  id: 'p5',
  mode: 'ride',
  carRef: { shaftId: 's4', index: 0 },
};

describe('ElevatorLayer shafts', () => {
  it('draws a shaft once and removes it when it is gone', () => {
    const { layer, missing } = layerWithArt();
    layer.showShafts([shaft]);
    layer.showShafts([shaft]);
    expect(layer.shaftCount).toBe(1);
    expect(layer.shaftView.children.length).toBe(3);
    layer.showShafts([]);
    expect(layer.shaftCount).toBe(0);
    expect(missing).toEqual([]);
  });

  it('redraws a shaft that changed its range', () => {
    const { layer } = layerWithArt();
    layer.showShafts([shaft]);
    layer.showShafts([{ ...shaft, top: 4 }]);
    expect(layer.shaftCount).toBe(1);
    expect(layer.shaftView.children.length).toBe(4);
  });
});

describe('ElevatorLayer cars', () => {
  it('moves a car between frames and swaps the door texture', () => {
    const { layer, textures } = layerWithArt();
    layer.showCars(frameOf(levelToIndex(1), 'closed'), shafts);
    const view = layer.carView.children[0];
    const first = view?.position.y ?? 0;
    layer.showCars(frameOf(levelToIndex(1) + 0.5, 'open'), shafts);
    expect(layer.carView.children[0]).toBe(view);
    expect(first - (view?.position.y ?? 0)).toBe(16);
    expect(view?.children[0]).toMatchObject({ texture: textures['transport/standard-car/open'] });
  });

  it('removes a car that is no longer in the frame', () => {
    const { layer } = layerWithArt();
    layer.showCars(frameOf(5, 'closed'), shafts);
    layer.showCars({ cars: new Map(), people: [] }, shafts);
    expect(layer.carCount).toBe(0);
    expect(layer.carView.children.length).toBe(0);
  });

  it('skips a car whose shaft is unknown', () => {
    const { layer } = layerWithArt();
    layer.showCars(frameOf(5, 'closed'), new Map());
    expect(layer.carCount).toBe(0);
  });

  it('draws riders inside an open car and hides them behind closed doors', () => {
    const { layer, textures } = layerWithArt();
    layer.showCars(frameOf(5, 'open', [rider]), shafts);
    const view = layer.carView.children[0];
    expect(view?.children.length).toBe(2);
    expect(view?.children[1]).toMatchObject({ texture: textures['people/worker-b/stand'] });

    layer.showCars(frameOf(5, 'closed', [rider]), shafts);
    expect(view?.children.length).toBe(1);
  });

  it('tints a stressed rider', () => {
    const { layer, textures } = layerWithArt();
    layer.showCars(frameOf(5, 'open', [{ ...rider, stress: 'stressed' }]), shafts);
    const view = layer.carView.children[0];
    expect(view?.children[1]).toMatchObject({ texture: textures['people/worker-b/stand-pink'] });
  });

  it('hides cars outside the visible levels', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 0, highest: 10 });
    layer.showCars(frameOf(50, 'closed'), shafts);
    const view = layer.carView.children[0];
    expect(view?.visible).toBe(false);
    layer.showOnly({ lowest: 45, highest: 55 });
    expect(view?.visible).toBe(true);
  });
});
