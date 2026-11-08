import { BufferImageSource, Texture } from 'pixi.js';
import type { SpriteId } from './atlasManifest';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';

const MAGENTA_RGBA = [0xff, 0x00, 0xff, 0xff] as const;

export type MissingSpriteReporter = (id: string) => void;

export interface SpriteVariant {
  /** Unit state, transport state or people action, such as `occupied` or `walk-pink`. */
  state?: string;
  time?: 'day' | 'night';
  /** Animation frame, starting at 1. */
  frame?: number;
}

/**
 * Builds an id such as `units/office/occupied_day` or `people/worker-a/walk_02`
 * from the subject path and the parts of the variant that apply.
 */
export function spriteVariantId(subject: string, variant: SpriteVariant): string {
  const parts: string[] = [];
  if (variant.state !== undefined) {
    parts.push(variant.state);
  }
  if (variant.time !== undefined) {
    parts.push(variant.time);
  }
  if (variant.frame !== undefined) {
    parts.push(String(variant.frame).padStart(2, '0'));
  }
  return parts.length === 0 ? subject : `${subject}/${parts.join('_')}`;
}

/** A solid magenta tile, one tile wide and one floor high, drawn where a sprite is missing. */
export function createPlaceholderTexture(): Texture {
  const pixels = new Uint8Array(TILE_WIDTH * FLOOR_HEIGHT * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set(MAGENTA_RGBA, offset);
  }
  const source = new BufferImageSource({
    resource: pixels,
    width: TILE_WIDTH,
    height: FLOOR_HEIGHT,
    scaleMode: 'nearest',
  });
  return new Texture({ source, label: 'missing-sprite' });
}

export function warnMissingSprite(id: string): void {
  console.warn(`Missing sprite "${id}", drawing the placeholder instead`);
}

/** Every sprite texture by id. Unknown ids get the placeholder and one warning each. */
export class SpriteRegistry {
  private readonly textures = new Map<string, Texture>();
  private readonly reportedMissing = new Set<string>();

  constructor(
    private readonly placeholder: Texture,
    private readonly reportMissing: MissingSpriteReporter = warnMissingSprite,
  ) {}

  addSheet(textures: Record<string, Texture>): void {
    for (const [id, texture] of Object.entries(textures)) {
      if (this.textures.has(id)) {
        throw new Error(`Sprite ${id} is in more than one atlas`);
      }
      this.textures.set(id, texture);
    }
  }

  has(id: string): boolean {
    return this.textures.has(id);
  }

  get size(): number {
    return this.textures.size;
  }

  texture(id: SpriteId): Texture {
    return this.lookup(id);
  }

  /** Variants are built at runtime, so their ids are only checked when drawn. */
  variant(subject: string, variant: SpriteVariant): Texture {
    return this.lookup(spriteVariantId(subject, variant));
  }

  /** The id `variant` would look up, so callers can tell when a texture needs to change. */
  idOf(subject: string, variant: SpriteVariant): string {
    return spriteVariantId(subject, variant);
  }

  private lookup(id: string): Texture {
    const texture = this.textures.get(id);
    if (texture !== undefined) {
      return texture;
    }
    if (!this.reportedMissing.has(id)) {
      this.reportedMissing.add(id);
      this.reportMissing(id);
    }
    return this.placeholder;
  }
}
