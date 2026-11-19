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

/**
 * The office room with its props, curtains and shade, as a container the size of the room.
 * An empty office shows only the bare room. Window glass stays transparent, so whatever is
 * behind the container (the sky) shows through, and the shade never covers open glass.
 */
export function buildOfficeView(
  registry: SpriteRegistry,
  layout: OfficeLayout,
  { state, time, shade = DEFAULT_OFFICE_SHADE, shadeColor = OFFICE_SHADE_COLOR }: OfficeViewOptions,
): Container {
  const room = new Container();
  room.addChild(new Sprite(registry.texture(BASE_SPRITE as SpriteId)));

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
    // Closed curtains cover the glass, so they are shaded with the room; open glass is cut out.
    const glassOpen = state !== 'closed';
    const overlay = new Graphics();
    overlay.rect(0, 0, OFFICE_ROOM.width, OFFICE_ROOM.height).fill({ color: shadeColor, alpha });
    if (glassOpen) {
      for (const window of OFFICE_WINDOWS) {
        overlay.rect(window.left, window.top, window.width, window.height).cut();
      }
    }
    room.addChild(overlay);
  }
  return room;
}
