import type { PersonKind } from '@tower-magnate/shared';

/**
 * How one person looks, worked out from their id alone. Every person is drawn from the same man or
 * woman model; skin, hair, clothes, height and build change per person, so the look is the same on
 * every frame, after a reload and in a car or on a floor.
 */
export type PersonModel = 'man' | 'woman';

export interface PersonLook {
  model: PersonModel;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** Vertical stretch of the 16-pixel frame, always a whole number of pixels tall. */
  scaleY: number;
  /** Horizontal stretch of the 8-pixel frame, always a whole number of pixels wide. */
  scaleX: number;
  /** Sprite subject of each layer, so a layer's texture is `<subject>/<state>_<frame>`. */
  subjects: {
    pants: string;
    shirt: string;
    skin: string;
    hair: string;
    fixed: string;
  };
}

export const FRAME_WIDTH = 8;
export const FRAME_HEIGHT = 16;

export const SPRITE_NAME_OF_KIND: Record<PersonKind, string> = {
  officeWorker: 'worker',
  resident: 'resident',
  hotelGuest: 'guest',
  customer: 'customer',
  audience: 'guest',
  partyGuest: 'guest',
  maid: 'maid',
  police: 'security',
  vip: 'vip',
  weddingGuest: 'guest',
  prospect: 'customer',
  builder: 'builder',
  staff: 'staff',
  // TODO: couriers wear a customer's outfit until the person art gets a delivery palette and a package.
  courier: 'customer',
  // Children use the same models and clothes as everyone, drawn smaller (see CHILD_* below).
  child: 'customer',
  // TODO: cleaners wear the maids' uniform until the person art gets one of their own.
  cleaner: 'maid',
};

export const SKIN_TONES: readonly number[] = [
  0xf6d3b8, 0xedbf9a, 0xe0a97f, 0xcf9265, 0xb97a52, 0xa0643f, 0x84492d, 0x663622, 0x4d2918,
];

/** Dark hair is common, so it is repeated; the rest come up less often. */
export const HAIR_COLORS: readonly number[] = [
  0x141218, 0x2a2430, 0x3a2a1c, 0x4a3422, 0x5a3c26, 0x6b4a2b, 0x7e5a32, 0x8a6a3c, 0xa87a3e,
  0xc9983e, 0xe6c26a, 0xb4542c, 0xcf6a3a, 0x8a8a98, 0xc4c3cc, 0xeeebe4,
];

/** Shirts, blouses and dresses for people with no uniform. */
export const SHIRT_COLORS: readonly number[] = [
  0xf4f1e8, 0xd6d4d0, 0x8fc8e0, 0x6fa8f0, 0x4f86d8, 0x5a6fd8, 0x7a8fe8, 0xe0454f, 0xf06a5f,
  0xf2894f, 0xf7b24f, 0xf7dc5b, 0xf0cf3a, 0xa8e070, 0x62b84a, 0x4fa86a, 0x3fbfae, 0x7fe0d4,
  0xf58ab4, 0xee6fa0, 0xb060c8, 0xc89ae8, 0xc08a54, 0xd8a468, 0xa0a0b0, 0x7a86a8, 0xe0e0ee,
  0xd8587a, 0xf0d9a8, 0x7ac27a,
];

export const TROUSER_COLORS: readonly number[] = [
  0x4f7fd0, 0x6a9ae0, 0x3f5fb0, 0x5a6aa8, 0x7a7a98, 0x9a9aa8, 0xb9b8c0, 0xc8b88c, 0x948576,
  0xd9c7a0, 0xb07a4a, 0x8a5a3a, 0x4f9a5a, 0x8a7f72, 0xc0506a,
];

/** Skirts take the trouser colors and brighter ones. */
export const SKIRT_COLORS: readonly number[] = [
  ...TROUSER_COLORS,
  0xe0454f,
  0xf2894f,
  0x62b84a,
  0xb060c8,
  0xf58ab4,
  0x3fbfae,
  0xe0e0ee,
];

const MAID_COLOR = 0xd6d4d0;
const GUARD_SHIRT = 0x4f86d8;
const GUARD_PANTS = 0x2f3a6a;
const BUILDER_SHIRT = 0xe0875a;
const BUILDER_PANTS: readonly number[] = [0x6b5f55, 0x5a3a26];
const STAFF_SHIRT: readonly number[] = [0x7a86a8, 0x4f86d8];
const STAFF_PANTS = 0x4f5a8a;
const VIP_SUITS: readonly number[] = [0x2f3a6a, 0x4a2f6a, 0x3a3a48];

export const MIN_SCALE_Y = 14 / FRAME_HEIGHT;
export const MAX_SCALE_Y = 18 / FRAME_HEIGHT;
export const MIN_SCALE_X = 7 / FRAME_WIDTH;
export const MAX_SCALE_X = 10 / FRAME_WIDTH;

/** Children are about 60 to 65% of an adult's height: 9 to 11 pixels of the 16-pixel frame, and narrow. */
export const MIN_CHILD_SCALE_Y = 9 / FRAME_HEIGHT;
export const MAX_CHILD_SCALE_Y = 11 / FRAME_HEIGHT;
export const MIN_CHILD_SCALE_X = 5 / FRAME_WIDTH;
export const MAX_CHILD_SCALE_X = 6 / FRAME_WIDTH;

/** FNV-1a over the id, then a final mix so ids that differ by one character are far apart. */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix(hash);
}

function mix(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** An independent number in 0 to 1 for each trait, taken from the id hash. */
function unit(hash: number, trait: number): number {
  return mix(hash ^ Math.imul(trait + 1, 0x9e3779b1)) / 0x100000000;
}

function pick<T>(list: readonly T[], value: number): T {
  return list[Math.min(list.length - 1, Math.floor(value * list.length))] as T;
}

/** Height pixels from 14 to 18 and width pixels from 7 to 10, clustered around the middle. */
function heightPixels(value: number, model: PersonModel): number {
  const centred = 14 + value * 4;
  return Math.round(model === 'woman' ? centred - 0.4 : centred);
}

function widthPixels(value: number): number {
  const steps = [7, 8, 8, 8, 9, 9, 10];
  return pick(steps, value);
}

function childHeightPixels(value: number): number {
  return pick([9, 10, 10, 11], value);
}

function childWidthPixels(value: number): number {
  return pick([5, 6], value);
}

interface Clothes {
  shirt: number;
  pants: number;
}

function clothesOf(name: string, model: PersonModel, hash: number): Clothes {
  switch (name) {
    case 'maid':
      return { shirt: MAID_COLOR, pants: MAID_COLOR };
    case 'security':
      return { shirt: GUARD_SHIRT, pants: GUARD_PANTS };
    case 'builder':
      return { shirt: BUILDER_SHIRT, pants: pick(BUILDER_PANTS, unit(hash, 5)) };
    case 'staff':
    case 'staffbag':
      return { shirt: pick(STAFF_SHIRT, unit(hash, 4)), pants: STAFF_PANTS };
    case 'vip': {
      const suit = pick(VIP_SUITS, unit(hash, 4));
      return { shirt: suit, pants: suit };
    }
    default:
      return {
        shirt: pick(SHIRT_COLORS, unit(hash, 4)),
        pants: pick(model === 'man' ? TROUSER_COLORS : SKIRT_COLORS, unit(hash, 5)),
      };
  }
}

/** Police, maids, builders and cleaners are drawn as ordinary civilians until the engine says they wear the uniform. */
export type Outfit = 'uniform' | undefined;

function spriteNameOf(kind: PersonKind, carrying: boolean, outfit: Outfit): string {
  if (carrying) return 'staffbag';
  if (
    (kind === 'police' || kind === 'maid' || kind === 'builder' || kind === 'cleaner') &&
    outfit !== 'uniform'
  ) {
    return 'customer';
  }
  return SPRITE_NAME_OF_KIND[kind];
}

/**
 * The look of a person, from their id, kind and outfit. Pure: the same inputs always give the same
 * look. A maid keeps the woman model in civilian clothes so changing does not change who she is.
 */
export function computeLook(
  id: string,
  kind: PersonKind,
  carrying = false,
  outfit: Outfit = undefined,
): PersonLook {
  const hash = hashId(id);
  const name = spriteNameOf(kind, carrying, outfit);
  const model: PersonModel = kind === 'maid' || unit(hash, 0) < 0.5 ? 'woman' : 'man';
  const clothes = clothesOf(name, model, hash);
  const child = kind === 'child';
  const height = child ? childHeightPixels(unit(hash, 6)) : heightPixels(unit(hash, 6), model);
  const width = child ? childWidthPixels(unit(hash, 7)) : widthPixels(unit(hash, 7));
  return {
    model,
    skin: pick(SKIN_TONES, unit(hash, 1)),
    hair: pick(HAIR_COLORS, unit(hash, 2)),
    shirt: clothes.shirt,
    pants: clothes.pants,
    scaleY: height / FRAME_HEIGHT,
    scaleX: width / FRAME_WIDTH,
    subjects: {
      pants: `people/pants-${model === 'man' ? 'trousers' : 'skirt'}`,
      shirt: `people/shirt-${model}`,
      skin: `people/skin-${model}`,
      hair: `people/hair-${model}`,
      fixed: `people/fixed-${name}-${model}`,
    },
  };
}

const MAX_CACHED = 20000;
const cache = new Map<
  string,
  { kind: PersonKind; carrying: boolean; outfit: Outfit; look: PersonLook }
>();

/** `computeLook` remembered by id, so a person keeps the same look object between frames. */
export function personLook(
  id: string,
  kind: PersonKind,
  carrying = false,
  outfit: Outfit = undefined,
): PersonLook {
  const cached = cache.get(id);
  if (
    cached !== undefined &&
    cached.kind === kind &&
    cached.carrying === carrying &&
    cached.outfit === outfit
  ) {
    return cached.look;
  }
  if (cache.size >= MAX_CACHED) {
    cache.clear();
  }
  const look = computeLook(id, kind, carrying, outfit);
  cache.set(id, { kind, carrying, outfit, look });
  return look;
}

/** Multiplies two 0xRRGGBB colors channel by channel, the way a sprite tint does. */
export function multiplyColors(first: number, second: number): number {
  const red = Math.round((((first >> 16) & 0xff) * ((second >> 16) & 0xff)) / 255);
  const green = Math.round((((first >> 8) & 0xff) * ((second >> 8) & 0xff)) / 255);
  const blue = Math.round(((first & 0xff) * (second & 0xff)) / 255);
  return (red << 16) | (green << 8) | blue;
}
