import { Sprite, Texture } from 'pixi.js';

const COLOR = 0xf2d36b;
const WIDTH = 3;
const HEIGHT = 2;
const GAP = 2;

/** Distance from the top of a head to the top of the marker above it. */
export const FOLLOWED_MARKER_LIFT = HEIGHT + GAP;

/** The lamp marker over a followed person, centred on x = 0 and sitting above y = 0. */
export function newFollowedMarker(): Sprite {
  const marker = new Sprite(Texture.WHITE);
  marker.width = WIDTH;
  marker.height = HEIGHT;
  marker.tint = COLOR;
  marker.anchor.set(0.5, 0);
  marker.position.set(0, -FOLLOWED_MARKER_LIFT);
  marker.visible = false;
  return marker;
}
