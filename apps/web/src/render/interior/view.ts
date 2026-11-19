import { Container, Graphics, Sprite } from 'pixi.js';
import type { SpriteId } from '../atlasManifest';
import type { SpriteRegistry } from '../spriteRegistry';
import type {
  InteriorKind,
  InteriorLayout,
  InteriorRect,
  InteriorSpec,
  InteriorTime,
  PropLook,
} from './types';
import { interiorKind } from './layout';

/** Night-deep from the palette, so the shade reads as a dark room rather than gray paint. */
export const INTERIOR_SHADE_COLOR = 0x10183a;

export interface InteriorViewOptions {
  state: string;
  time: InteriorTime;
  /** Overrides the spec's shade table, for the sprite lab. */
  shade?: InteriorSpec['shade'];
  shadeColor?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The room minus the holes, as rectangles: one band per run of rows that the same holes cross. */
export function rectsAround(room: Rect, holes: readonly Rect[]): Rect[] {
  const edges = new Set([room.y, room.y + room.height]);
  for (const hole of holes) {
    edges.add(hole.y);
    edges.add(hole.y + hole.height);
  }
  const rows = [...edges]
    .filter((y) => y >= room.y && y <= room.y + room.height)
    .sort((a, b) => a - b);
  const rects: Rect[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const top = rows[i] as number;
    const bottom = rows[i + 1] as number;
    const crossing = holes
      .filter((hole) => hole.y <= top && hole.y + hole.height >= bottom)
      .sort((a, b) => a.x - b.x);
    let x = room.x;
    for (const hole of crossing) {
      if (hole.x > x) rects.push({ x, y: top, width: hole.x - x, height: bottom - top });
      x = Math.max(x, hole.x + hole.width);
    }
    const right = room.x + room.width;
    if (x < right) rects.push({ x, y: top, width: right - x, height: bottom - top });
  }
  return rects;
}

/** The sprite of a prop in a look; a prop without that look shows idle. */
export function propSpriteId(spec: InteriorSpec, entry: InteriorKind, look: PropLook): string {
  const drawn = look === 'idle' || entry.looks?.includes(look) === true ? look : 'idle';
  return `${spec.group}/${entry.kind}/${drawn}`;
}

/** Curtains come in the size of the window they hang over. */
export function curtainSpriteId(
  spec: InteriorSpec,
  curtains: 'open' | 'closed',
  window: InteriorRect,
): string {
  return `${spec.group}/curtains/${curtains}_${window.width}x${window.height}`;
}

const shadeAroundGlass = new WeakMap<InteriorSpec, Rect[]>();

/** The shade of a room whose glass is open: everything but the window glass. */
function shadeRects(spec: InteriorSpec): Rect[] {
  let rects = shadeAroundGlass.get(spec);
  if (rects === undefined) {
    rects = rectsAround(
      { x: 0, y: 0, width: spec.room.width, height: spec.room.height },
      spec.windows.map((window) => ({
        x: window.left,
        y: window.top,
        width: window.width,
        height: window.height,
      })),
    );
    shadeAroundGlass.set(spec, rects);
  }
  return rects;
}

/**
 * What goes on top of the bare room: props, curtains and shade, in room pixels. Window glass
 * stays transparent, so the sky behind the unit shows through, and the shade never covers
 * open glass.
 */
export function buildInterior(
  registry: SpriteRegistry,
  spec: InteriorSpec,
  layout: InteriorLayout,
  { state, time, shade = spec.shade, shadeColor = INTERIOR_SHADE_COLOR }: InteriorViewOptions,
): Container {
  const room = new Container();
  const look = spec.propLook[state];
  if (look !== null && look !== undefined) {
    for (const prop of layout.props) {
      const entry = interiorKind(spec, prop.kind);
      if (entry.hiddenIn?.includes(state) === true) continue;
      const id = propSpriteId(spec, entry, look);
      const sprite = new Sprite(registry.texture(id as SpriteId));
      sprite.y = prop.y;
      if (prop.flip) {
        sprite.scale.x = -1;
        sprite.x = prop.x + prop.width;
      } else {
        sprite.x = prop.x;
      }
      room.addChild(sprite);
    }
  }
  for (const overlay of spec.overlays?.[state] ?? []) {
    room.addChild(new Sprite(registry.texture(overlay as SpriteId)));
  }
  const curtains = spec.curtains[state];
  if (curtains !== null && curtains !== undefined) {
    for (const window of spec.windows) {
      const sprite = new Sprite(
        registry.texture(curtainSpriteId(spec, curtains, window) as SpriteId),
      );
      sprite.position.set(window.left, window.top);
      room.addChild(sprite);
    }
  }

  const alpha = shade[state]?.[time] ?? 0;
  if (alpha > 0) {
    // Closed curtains cover the glass, so they are shaded with the room.
    const rects =
      curtains === 'closed'
        ? [{ x: 0, y: 0, width: spec.room.width, height: spec.room.height }]
        : shadeRects(spec);
    const overlay = new Graphics();
    for (const rect of rects) {
      overlay.rect(rect.x, rect.y, rect.width, rect.height);
    }
    overlay.fill({ color: shadeColor, alpha });
    room.addChild(overlay);
  }
  return room;
}

/** The bare room with its interior on top, as a container the size of the room. */
export function buildInteriorRoom(
  registry: SpriteRegistry,
  spec: InteriorSpec,
  layout: InteriorLayout,
  options: InteriorViewOptions,
): Container {
  const room = new Container();
  room.addChild(new Sprite(registry.texture(spec.baseSprite as SpriteId)));
  room.addChild(buildInterior(registry, spec, layout, options));
  return room;
}
