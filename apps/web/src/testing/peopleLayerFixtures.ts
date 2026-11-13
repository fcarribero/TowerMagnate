import type { PersonView } from '@tower-magnate/shared';
import { Texture } from 'pixi.js';
import type { DrawnFrame } from '../model/interpolation';
import { PeopleLayer } from '../render/peopleLayer';
import { SpriteRegistry } from '../render/spriteRegistry';
import { walker } from './protocolFixtures';

const MODELS = ['man', 'woman'];
const KINDS = [
  'worker',
  'resident',
  'guest',
  'customer',
  'maid',
  'security',
  'vip',
  'builder',
  'staff',
  'staffbag',
];
const LAYERS = [
  'pants-trousers',
  'pants-skirt',
  'shirt-man',
  'shirt-woman',
  'skin-man',
  'skin-woman',
  'hair-man',
  'hair-woman',
];
const POSES = ['stand', 'idle_01', 'idle_02', 'walk_01', 'walk_02'];

/** Every layer sprite of the one man and one woman model, plus each kind's fixed layer. */
export const PEOPLE_SPRITE_IDS = [
  ...LAYERS,
  ...KINDS.flatMap((kind) => MODELS.map((model) => `fixed-${kind}-${model}`)),
].flatMap((subject) => POSES.map((pose) => `people/${subject}/${pose}`));

export function peopleTextures(): Record<string, Texture> {
  const textures: Record<string, Texture> = {};
  for (const id of PEOPLE_SPRITE_IDS) {
    textures[id] = new Texture();
  }
  return textures;
}

export function layerWithArt(now?: () => number) {
  const textures = peopleTextures();
  const registry = new SpriteRegistry(new Texture(), () => undefined);
  registry.addSheet(textures);
  return { layer: new PeopleLayer(registry, now), textures };
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
