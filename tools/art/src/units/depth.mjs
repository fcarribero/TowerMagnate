import { PixelCanvas } from '../canvas.mjs';
import { colorIndex } from '../palette.mjs';
import { metrics } from '../metrics.mjs';
import { toNight } from '../night.mjs';

// Window glass by day and night. These pixels are cleared in the back layer so
// the game can draw the sky behind them. Lit night windows keep their lamp color.
const GLASS_COLORS = ['glass', 'sky-light', 'night', 'night-deep'].map(colorIndex);
const CLEAR = 0;

// The front is the part of a room that does not move with the camera: the ink
// frame (left, right and top edges) and the slab under every floor.
function isFront(x, y, width) {
  const slabTop = metrics.floorHeight - metrics.slabHeight;
  return x === 0 || x === width - 1 || y === 0 || y % metrics.floorHeight >= slabTop;
}

// Splits a drawn room into the layer behind the frame and the frame itself.
export function splitLayers(room) {
  const back = new PixelCanvas(room.width, room.height);
  const front = new PixelCanvas(room.width, room.height);
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const index = room.get(x, y);
      if (index === CLEAR) {
        continue;
      }
      if (isFront(x, y, room.width)) {
        front.set(x, y, index);
      } else if (!GLASS_COLORS.includes(index)) {
        back.set(x, y, index);
      }
    }
  }
  return { back, front };
}

function swatch(color) {
  const canvas = new PixelCanvas(1, 1);
  canvas.set(0, 0, color);
  return canvas;
}

function floorStrip(floor) {
  const canvas = new PixelCanvas(1, floor.length);
  floor.forEach((color, row) => canvas.set(0, row, color));
  return canvas;
}

const SPRITE_PATTERN = /^units\/([^/]+)\/(.+)_(day|night)$/;

// For every room drawn with roomShell, adds the layers the client uses for parallax:
// `back-<state>` and `front-<state>` per drawn sprite, and `side`, `ceiling` and
// `floor` swatches per unit type. The original sprites stay as they are.
export function depthSprites(sprites) {
  const looks = new Map();
  for (const sprite of sprites) {
    const match = SPRITE_PATTERN.exec(sprite.id);
    if (match !== null && sprite.canvas.shellLook !== undefined) {
      looks.set(match[1], sprite.canvas.shellLook);
    }
  }
  const added = [];
  for (const sprite of sprites) {
    const match = SPRITE_PATTERN.exec(sprite.id);
    if (match === null || !looks.has(match[1])) {
      continue;
    }
    const [, subject, state, time] = match;
    const { back, front } = splitLayers(sprite.canvas);
    added.push({ id: `units/${subject}/back-${state}_${time}`, canvas: back });
    added.push({ id: `units/${subject}/front-${state}_${time}`, canvas: front });
  }
  for (const [subject, look] of looks) {
    const day = {
      side: swatch(look.wallDark),
      ceiling: swatch(look.wallLight),
      floor: floorStrip(look.floor),
    };
    for (const [name, canvas] of Object.entries(day)) {
      added.push({ id: `units/${subject}/${name}_day`, canvas });
      added.push({ id: `units/${subject}/${name}_night`, canvas: toNight(canvas) });
    }
  }
  return [...sprites, ...added];
}
