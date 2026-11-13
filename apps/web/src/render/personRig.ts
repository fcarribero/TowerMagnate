import { Sprite } from 'pixi.js';
import { FRAME_HEIGHT, FRAME_WIDTH, multiplyColors, type PersonLook } from './personLook';
import type { SpriteRegistry } from './spriteRegistry';

const NO_TINT = 0xffffff;

/** A person's sprite subject, action and frame; the look says how each layer is colored and shaped. */
export interface PersonPose {
  look: PersonLook;
  state: string;
  frame?: number;
}

/**
 * One person drawn as stacked layers of the same frame: trousers or skirt (the root sprite), shirt,
 * skin, hair and the fixed parts (shoes, uniform, props). The root's scale stretches every layer, and
 * its anchor is the bottom center, so the feet stay on the floor line whatever the height.
 */
export class PersonRig {
  readonly root = new Sprite();
  private readonly shirt = new Sprite();
  private readonly skin = new Sprite();
  private readonly hair = new Sprite();
  private readonly fixed = new Sprite();
  private look: PersonLook | null = null;
  private state = '';
  private frame: number | undefined;
  private tinted = NO_TINT;

  constructor() {
    this.root.anchor.set(0.5, 1);
    for (const layer of [this.shirt, this.skin, this.hair, this.fixed]) {
      layer.anchor.set(0.5, 1);
      this.root.addChild(layer);
    }
  }

  /** Swaps the layer textures, only when the look, action or frame changed. */
  setPose(sprites: SpriteRegistry, pose: PersonPose): void {
    if (pose.look === this.look && pose.state === this.state && pose.frame === this.frame) {
      return;
    }
    const { look, state, frame } = pose;
    const variant = { state, frame };
    this.root.texture = sprites.variant(look.subjects.pants, variant);
    this.shirt.texture = sprites.variant(look.subjects.shirt, variant);
    this.skin.texture = sprites.variant(look.subjects.skin, variant);
    this.hair.texture = sprites.variant(look.subjects.hair, variant);
    this.fixed.texture = sprites.variant(look.subjects.fixed, variant);
    if (look !== this.look) {
      this.look = look;
      this.applyColors(look, this.tinted);
    }
    this.state = state;
    this.frame = frame;
  }

  /** Multiplies every layer by `tint`, such as the warm tint of wedding guests. */
  setTint(tint: number): void {
    if (tint === this.tinted) {
      return;
    }
    this.tinted = tint;
    if (this.look !== null) {
      this.applyColors(this.look, tint);
    }
  }

  private applyColors(look: PersonLook, tint: number): void {
    this.root.tint = multiplyColors(look.pants, tint);
    this.shirt.tint = multiplyColors(look.shirt, tint);
    this.skin.tint = multiplyColors(look.skin, tint);
    this.hair.tint = multiplyColors(look.hair, tint);
    this.fixed.tint = tint;
  }

  /**
   * Puts the feet at `feetY` and the middle of the figure at `centerX`, mirrored when `facing`
   * is left. The stretched frame covers whole pixels, so its left edge is rounded to one.
   */
  place(centerX: number, feetY: number, facing: 'left' | 'right' | string): void {
    const look = this.look;
    const scaleX = look?.scaleX ?? 1;
    const scaleY = look?.scaleY ?? 1;
    const width = FRAME_WIDTH * scaleX;
    this.root.scale.set(facing === 'left' ? -scaleX : scaleX, scaleY);
    this.root.position.set(Math.round(centerX - width / 2) + width / 2, feetY);
  }

  /** Pixels from the feet to the top of the head. */
  get height(): number {
    return FRAME_HEIGHT * (this.look?.scaleY ?? 1);
  }
}
