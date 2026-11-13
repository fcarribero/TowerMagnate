import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { skyColorAt } from './skyRows';
import { FLOOR_HEIGHT, SLAB_HEIGHT } from './metrics';

export interface DepthTextures {
  back: Texture;
  front: Texture;
  side: Texture;
  ceiling: Texture;
  floor: Texture;
}

/**
 * A room drawn as a box: the back wall slides against the frame as the camera
 * moves, and side wall, ceiling and floor fill the gap. Window glass is clear in
 * the back layer, so the sky shows through it.
 */
export class DepthRoom {
  readonly view = new Container();
  private readonly inside = new Container();
  private readonly clip = new Graphics();
  private readonly sky = new Graphics();
  private readonly ceiling: Sprite;
  private readonly leftWall: Sprite;
  private readonly rightWall: Sprite;
  private readonly floor: Sprite;
  private readonly back: Sprite;
  private readonly innerWidth: number;
  private readonly innerHeight: number;
  private readonly floors: number;
  private skyKey = '';
  private shift = '';

  constructor(
    textures: DepthTextures,
    readonly width: number,
    readonly height: number,
  ) {
    this.floors = Math.max(1, Math.round(height / FLOOR_HEIGHT));
    this.innerWidth = width - 2;
    this.innerHeight = height - SLAB_HEIGHT - 1;
    this.ceiling = new Sprite(textures.ceiling);
    this.leftWall = new Sprite(textures.side);
    this.rightWall = new Sprite(textures.side);
    this.floor = new Sprite(textures.floor);
    this.back = new Sprite(textures.back);
    this.clip.rect(1, 1, this.innerWidth, this.innerHeight).fill(0xffffff);
    this.inside.mask = this.clip;
    this.inside.addChild(
      this.sky,
      this.ceiling,
      this.leftWall,
      this.rightWall,
      this.floor,
      this.back,
    );
    this.view.addChild(this.clip, this.inside);
  }

  setTextures(textures: DepthTextures): void {
    this.back.texture = textures.back;
    this.ceiling.texture = textures.ceiling;
    this.leftWall.texture = textures.side;
    this.rightWall.texture = textures.side;
    this.floor.texture = textures.floor;
    this.shift = '';
  }

  /** Window sky: one flat colour for the altitude of the room. */
  setSky(altitude: number, time: 'day' | 'night'): void {
    const key = `${time}:${altitude.toFixed(3)}`;
    if (key === this.skyKey) {
      return;
    }
    this.skyKey = key;
    const [r, g, b] = skyColorAt(altitude, time);
    this.sky
      .clear()
      .rect(1, 1, this.innerWidth, this.innerHeight)
      .fill((r << 16) | (g << 8) | b);
  }

  /** Places the layers for a back wall shifted by (dx, dy) from the frame. */
  setShift(dx: number, dy: number): void {
    const verticalShift = this.floors > 1 ? 0 : dy;
    const key = `${dx},${verticalShift}`;
    if (key === this.shift) {
      return;
    }
    this.shift = key;
    const sx = dx;
    const sy = verticalShift;
    const w = this.innerWidth;
    const h = this.innerHeight;
    this.back.position.set(sx, sy);

    this.leftWall.visible = sx > 0;
    if (sx > 0) {
      this.leftWall.position.set(1, 1);
      this.leftWall.scale.set(Math.hypot(sx, sy), h);
      this.leftWall.skew.set(0, Math.atan2(sy, sx));
    }
    this.rightWall.visible = sx < 0;
    if (sx < 0) {
      this.rightWall.position.set(1 + w + sx, 1 + sy);
      this.rightWall.scale.set(Math.hypot(sx, sy), h);
      this.rightWall.skew.set(0, Math.atan2(-sy, -sx));
    }
    this.ceiling.visible = sy > 0;
    if (sy > 0) {
      this.ceiling.position.set(1, 1);
      this.ceiling.scale.set(w, Math.hypot(sx, sy));
      this.ceiling.skew.set(Math.atan2(sx, sy), 0);
    }
    this.floor.visible = sy < 0;
    if (sy < 0) {
      this.floor.position.set(1 + sx, 1 + h + sy);
      this.floor.scale.set(w, Math.hypot(sx, sy) / Math.max(1, this.floor.texture.height));
      this.floor.skew.set(Math.atan2(-sx, -sy), 0);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
