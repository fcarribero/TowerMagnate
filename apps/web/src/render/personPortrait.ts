import type { PersonKind } from '@tower-magnate/shared';
import { FRAME_HEIGHT, FRAME_WIDTH, personLook, type PersonLook } from './personLook';
import type { SpriteRegistry } from './spriteRegistry';

/** The sprites the stage loaded, kept so a window can draw a person the way the tower does. */
let sprites: SpriteRegistry | null = null;

export function setPortraitSprites(registry: SpriteRegistry | null): void {
  sprites = registry;
}

/** The standing pose a window draws: the first idle frame. */
const STAND_POSE = { state: 'idle', frame: 1 } as const;

const LAYERS = ['pants', 'shirt', 'skin', 'hair', 'fixed'] as const;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Whole pixels of the person's frame, the same size the person has in the tower. */
export function portraitSize(look: PersonLook): { width: number; height: number } {
  return {
    width: Math.round(FRAME_WIDTH * look.scaleX),
    height: Math.round(FRAME_HEIGHT * look.scaleY),
  };
}

/** Draws one standing person on a canvas, layer by layer, tinted like the stage tints them. */
export function drawPortrait(canvas: HTMLCanvasElement, id: string, kind: PersonKind): boolean {
  const registry = sprites;
  if (registry === null) {
    return false;
  }
  const context = canvas.getContext('2d');
  if (context === null) {
    return false;
  }
  // The portrait shows the work uniform of police and maids.
  const look = personLook(id, kind, false, 'uniform');
  const { width, height } = portraitSize(look);
  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const paint = layer.getContext('2d');
  if (paint === null) {
    return false;
  }
  paint.imageSmoothingEnabled = false;
  for (const name of LAYERS) {
    const texture = registry.variant(look.subjects[name], STAND_POSE);
    const resolution = texture.source.resolution ?? 1;
    const frame = texture.frame;
    paint.globalCompositeOperation = 'source-over';
    paint.clearRect(0, 0, width, height);
    paint.drawImage(
      texture.source.resource as CanvasImageSource,
      frame.x * resolution,
      frame.y * resolution,
      frame.width * resolution,
      frame.height * resolution,
      0,
      0,
      width,
      height,
    );
    const tint = name === 'fixed' ? null : look[name];
    if (tint !== null) {
      paint.globalCompositeOperation = 'multiply';
      paint.fillStyle = hex(tint);
      paint.fillRect(0, 0, width, height);
      // Multiply also paints the transparent pixels; cut them back to the layer's own shape.
      paint.globalCompositeOperation = 'destination-in';
      paint.drawImage(
        texture.source.resource as CanvasImageSource,
        frame.x * resolution,
        frame.y * resolution,
        frame.width * resolution,
        frame.height * resolution,
        0,
        0,
        width,
        height,
      );
    }
    context.drawImage(layer, 0, 0);
  }
  return true;
}
