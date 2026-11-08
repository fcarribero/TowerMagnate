import type { PersonView } from '@tower-magnate/shared';
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { DrawnFrame } from '../model/interpolation';
import { walker } from '../testing/protocolFixtures';
import { floorSprite } from './elevatorPlan';
import { PeopleLayer } from './peopleLayer';
import { SpriteRegistry } from './spriteRegistry';

const IDS = [
  'people/worker-b/stand',
  'people/worker-b/stand-pink',
  'people/worker-b/stand-red',
  'people/worker-b/walk_01',
  'people/worker-b/walk_02',
  'people/worker-b/walk-pink_01',
  'people/worker-b/walk-red_02',
];

function layerWithArt() {
  const textures: Record<string, Texture> = {};
  for (const id of IDS) {
    textures[id] = new Texture();
  }
  const registry = new SpriteRegistry(new Texture(), () => undefined);
  registry.addSheet(textures);
  return { layer: new PeopleLayer(registry), textures };
}

const person = (id: string, patch: Partial<PersonView>): PersonView => ({
  ...walker,
  id,
  ...patch,
});

function frameOf(...people: PersonView[]): DrawnFrame {
  return {
    cars: new Map(),
    people: people.map((one) => ({ person: one, x: one.x, position: 2 })),
  };
}

describe('floorSprite', () => {
  it('picks the stress tint from the stress level', () => {
    const states = (['normal', 'stressed', 'veryStressed'] as const).map(
      (stress) => floorSprite(person('p1', { mode: 'wait', stress }), 0).state,
    );
    expect(states).toEqual(['stand', 'stand-pink', 'stand-red']);
  });

  it('alternates walk frames every half column', () => {
    const frames = [0, 0.5, 1, 1.5].map((x) => floorSprite(person('p1', {}), x).frame);
    expect(frames).toEqual([1, 2, 1, 2]);
  });
});

describe('PeopleLayer', () => {
  it('turns a waiting person pink while it keeps waiting', () => {
    const { layer, textures } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'normal' })));
    layer.show(frameOf(person('p1', { mode: 'wait', stress: 'stressed' })));
    expect(layer.count).toBe(1);
    expect(layer.view.children[0]).toMatchObject({
      texture: textures['people/worker-b/stand-pink'],
    });
  });

  it('removes people missing from the frame', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', {}), person('p2', {})));
    layer.show(frameOf(person('p2', {})));
    expect(layer.count).toBe(1);
  });

  it('leaves riders to the elevator layer', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', { mode: 'ride' })));
    expect(layer.count).toBe(0);
  });

  it('hides people off screen and shows them when the range reaches them', () => {
    const { layer } = layerWithArt();
    layer.showOnly({ lowest: 50, highest: 60 });
    layer.show(frameOf(person('p1', {})));
    expect(layer.view.children[0]?.visible).toBe(false);
    layer.showOnly({ lowest: 0, highest: 5 });
    expect(layer.view.children[0]?.visible).toBe(true);
  });

  it('mirrors a person facing left', () => {
    const { layer } = layerWithArt();
    layer.show(frameOf(person('p1', { facing: 'left' })));
    expect(layer.view.children[0]?.scale.x).toBe(-1);
  });
});
