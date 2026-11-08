import { Texture } from 'pixi.js';
import { OVERLAY_HEX, type OverlayColor } from './overlayColors';

const textures = new Map<OverlayColor, Texture>();

/** A 2 x 2 texture with the color on one diagonal and nothing on the other. */
export function checkerTexture(color: OverlayColor): Texture {
  const existing = textures.get(color);
  if (existing !== undefined) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = OVERLAY_HEX[color];
    context.fillRect(0, 0, 1, 1);
    context.fillRect(1, 1, 1, 1);
  }
  const texture = Texture.from(canvas);
  textures.set(color, texture);
  return texture;
}
