import type { PersonView } from '@tower-magnate/shared';
import { Texture } from 'pixi.js';
import type { DrawnFrame } from '../model/interpolation';
import { PeopleLayer } from '../render/peopleLayer';
import { SpriteRegistry } from '../render/spriteRegistry';
import { walker } from './protocolFixtures';

const IDS = [
  'people/worker-b/stand',
  'people/worker-b/stand-pink',
  'people/worker-b/stand-red',
  'people/worker-b/walk_01',
  'people/worker-b/walk_02',
  'people/worker-b/walk-pink_01',
  'people/worker-b/walk-red_02',
];

export function layerWithArt() {
  const textures: Record<string, Texture> = {};
  for (const id of IDS) {
    textures[id] = new Texture();
  }
  const registry = new SpriteRegistry(new Texture(), () => undefined);
  registry.addSheet(textures);
  return { layer: new PeopleLayer(registry), textures };
}

export const person = (id: string, patch: Partial<PersonView>): PersonView => ({
  ...walker,
  id,
  ...patch,
});

export function frameOf(...people: PersonView[]): DrawnFrame {
  return {
    cars: new Map(),
    people: people.map((one) => ({ person: one, x: one.x, position: 2 })),
  };
}

export function crowdFrame(size: number, shift: number): DrawnFrame {
  const stresses = ['normal', 'stressed', 'veryStressed'] as const;
  return frameOf(
    ...Array.from({ length: size }, (_, index) =>
      person(`p${index}`, {
        x: (index % 200) + shift,
        mode: index % 2 === 0 ? 'walk' : 'wait',
        stress: stresses[index % 3],
      }),
    ),
  );
}

/** A crowd spread over the floors of a tower, the people whose id is in `leaving` left out. */
export function towerCrowdFrame(
  size: number,
  shift: number,
  floors: number,
  leaving: (index: number) => boolean = () => false,
): DrawnFrame {
  const stresses = ['normal', 'stressed', 'veryStressed'] as const;
  const people = [];
  for (let index = 0; index < size; index++) {
    if (leaving(index)) continue;
    const one = person(`p${index}`, {
      x: (index % 200) + shift,
      mode: index % 2 === 0 ? 'walk' : 'wait',
      stress: stresses[index % 3],
    });
    people.push({ person: one, x: one.x, position: index % floors });
  }
  return { cars: new Map(), people };
}
