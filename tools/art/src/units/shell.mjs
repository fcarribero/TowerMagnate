import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';
import { lightsOff, toNight } from '../night.mjs';

export const FLOOR_ROW = metrics.floorHeight - metrics.slabHeight - 1;
const SLAB_COLORS = ['concrete-light', 'concrete', 'concrete-dark'];

// An empty one-floor room: ink frame on the outer edge, back wall lit from the
// upper left, a three-row floor and the concrete slab shared with bare floor tiles.
export function roomShell(widthTiles, { wall, wallLight, wallDark, floor }, floors = 1) {
  const width = widthTiles * metrics.tileWidth;
  const height = floors * metrics.floorHeight;
  const room = new PixelCanvas(width, height);

  room.fillRect(0, 0, width, height, wall);
  room.hline(1, 1, width - 2, wallLight);
  for (let level = 0; level < floors; level++) {
    const offset = level * metrics.floorHeight;
    const floorTop = offset + FLOOR_ROW - floor.length + 1;
    room.vline(1, offset + 1, floorTop - offset - 1, wallLight);
    room.vline(width - 2, offset + 2, floorTop - offset - 2, wallDark);
    floor.forEach((color, row) => room.hline(0, floorTop + row, width, color));
    SLAB_COLORS.forEach((color, row) => room.hline(0, offset + FLOOR_ROW + 1 + row, width, color));
  }

  room.hline(0, 0, width, 'ink');
  room.vline(0, 0, height - metrics.slabHeight, 'ink');
  room.vline(width - 1, 0, height - metrics.slabHeight, 'ink');
  room.shellLook = { wall, wallLight, wallDark, floor };
  return room;
}

// A window in the back wall: a silver frame around day glass with a centre mullion
// and one highlight pixel in the upper-left pane.
// The glass is transparent so the sky behind the unit shows through; only the
// frame, mullion and highlight pixels are drawn.
export function drawWindow(room, { left, top, width, height }) {
  room.fillRect(left, top, width, height, 0);
  room.strokeRect(left - 1, top - 1, width + 2, height + 2, 'silver');
  room.vline(left + Math.floor(width / 2), top, height, 'silver');
  room.set(left + 1, top + 1, 'sky-light');
  room.set(left + 2, top + 1, 'sky-light');
  room.set(left + 1, top + 2, 'sky-light');
}

// Night keeps the layout: materials step down their ramp, and window glass shows
// lamp light with a glowing centre when someone is in, or dark glass when empty.
// An empty unit is also switched off: its glass stays transparent and its lamps go out.
export function nightVersion(daySprite, windows, occupied) {
  const night = occupied ? toNight(daySprite) : lightsOff(toNight(daySprite));
  for (const { left, top, width, height } of windows) {
    if (occupied) {
      night.fillRect(left, top, width, height, 'lamp');
      night.fillRect(left + 2, top + 2, width - 4, height - 4, 'lamp-glow');
    } else {
      night.fillRect(left, top, width, height, 0);
    }
    night.vline(left + Math.floor(width / 2), top, height, 'gray');
  }
  return night;
}

export const UNIT_STATES = ['empty', 'occupied'];
export const TIMES = ['day', 'night'];

// Returns the four sprites of a rentable unit: empty and occupied, day and night.
export function unitSprites(subject, { windows, drawDay }) {
  const sprites = [];
  for (const state of UNIT_STATES) {
    const occupied = state === 'occupied';
    const day = drawDay(occupied);
    for (const time of TIMES) {
      const canvas = time === 'day' ? day : nightVersion(day, windows, occupied);
      sprites.push({ id: `units/${subject}/${state}_${time}`, canvas });
    }
  }
  return sprites;
}
