import { Container, Graphics, Sprite } from 'pixi.js';
import { officePropSpriteId } from './officeCatalog';
import { OFFICE_ROOM, OFFICE_WINDOWS, type OfficeLayout } from './officeLayout';
import type { SpriteId } from './atlasManifest';
import type { SpriteRegistry } from './spriteRegistry';

/** empty: nobody rents it, bare room. closed: rented, nobody in, curtains drawn. occupied: someone is working. */
export type OfficeState = 'empty' | 'closed' | 'occupied';
export type OfficeTime = 'day' | 'night';

/** How dark the shade over the room is for each state and time, from 0 (none) to 1 (black). */
export type OfficeShadeTable = Record<OfficeState, Record<OfficeTime, number>>;

/** A lit office keeps its day colors at night; a dark one is shaded, more so at night. */
export const DEFAULT_OFFICE_SHADE: OfficeShadeTable = {
  empty: { day: 0, night: 0.55 },
  closed: { day: 0.3, night: 0.6 },
  occupied: { day: 0, night: 0 },
};

/** Night-deep from the palette, so the shade reads as a dark room rather than gray paint. */
export const OFFICE_SHADE_COLOR = 0x10183a;

const BASE_SPRITE = 'units/office/empty_day';

export interface OfficeViewOptions {
  state: OfficeState;
  time: OfficeTime;
  shade?: OfficeShadeTable;
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

const ROOM_RECT: Rect = { x: 0, y: 0, width: OFFICE_ROOM.width, height: OFFICE_ROOM.height };
const GLASS: readonly Rect[] = OFFICE_WINDOWS.map((window) => ({
  x: window.left,
  y: window.top,
  width: window.width,
  height: window.height,
}));
/** The shade of a room whose glass is open: everything but the window glass. */
const SHADE_AROUND_GLASS = rectsAround(ROOM_RECT, GLASS);

/**
 * What goes on top of the bare office room: props, curtains and shade, in room pixels. An empty
 * office has no props or curtains. Window glass stays transparent, so the sky behind the unit
 * shows through, and the shade never covers open glass.
 */
export function buildOfficeInterior(
  registry: SpriteRegistry,
  layout: OfficeLayout,
  { state, time, shade = DEFAULT_OFFICE_SHADE, shadeColor = OFFICE_SHADE_COLOR }: OfficeViewOptions,
): Container {
  const room = new Container();
  if (state !== 'empty') {
    const occupied = state === 'occupied';
    for (const prop of layout.props) {
      const sprite = new Sprite(
        registry.texture(officePropSpriteId(prop.kind, occupied) as SpriteId),
      );
      sprite.y = prop.y;
      if (prop.flip) {
        sprite.scale.x = -1;
        sprite.x = prop.x + prop.width;
      } else {
        sprite.x = prop.x;
      }
      room.addChild(sprite);
    }
    const curtain = registry.texture(
      (occupied ? 'office/curtains/open' : 'office/curtains/closed') as SpriteId,
    );
    for (const window of OFFICE_WINDOWS) {
      const sprite = new Sprite(curtain);
      sprite.position.set(window.left, window.top);
      room.addChild(sprite);
    }
  }

  const alpha = shade[state][time];
  if (alpha > 0) {
    // Closed curtains cover the glass, so they are shaded with the room.
    const rects = state === 'closed' ? [ROOM_RECT] : SHADE_AROUND_GLASS;
    const overlay = new Graphics();
    for (const rect of rects) {
      overlay.rect(rect.x, rect.y, rect.width, rect.height);
    }
    overlay.fill({ color: shadeColor, alpha });
    room.addChild(overlay);
  }
  return room;
}

/** The bare office room with its interior on top, as a container the size of the room. */
export function buildOfficeView(
  registry: SpriteRegistry,
  layout: OfficeLayout,
  options: OfficeViewOptions,
): Container {
  const room = new Container();
  room.addChild(new Sprite(registry.texture(BASE_SPRITE as SpriteId)));
  room.addChild(buildOfficeInterior(registry, layout, options));
  return room;
}
