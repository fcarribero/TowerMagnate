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

// Night keeps the layout. A unit with someone inside is lit: its room keeps the day
// colors and lamps. Any other unit is dark: walls and furniture step down their ramp
// twice and the lamps go out. Window glass is transparent in both, so the sky shows through.
export function nightVersion(daySprite, windows, occupied) {
  const night = occupied ? daySprite.clone() : lightsOff(toNight(toNight(daySprite)));
  for (const { left, top, width, height } of windows) {
    night.fillRect(left, top, width, height, 0);
    night.vline(left + Math.floor(width / 2), top, height, occupied ? 'silver' : 'gray');
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

// Closed curtains over a window: a rod on top, cloth in soft vertical folds and a hem.
export function drawCurtains(room, { left, top, width, height }) {
  room.fillRect(left, top, width, height, 'cloud');
  for (let x = left + 2; x < left + width; x += 3) {
    room.vline(x, top + 1, height - 1, 'silver');
  }
  room.hline(left, top, width, 'gray');
  room.hline(left, top + height - 1, width, 'silver');
}

// Open curtains: the same rod and cloth gathered at both sides, the glass left clear.
export function drawOpenCurtains(room, { left, top, width, height }) {
  const side = 3;
  for (const x of [left, left + width - side]) {
    room.fillRect(x, top + 1, side, height - 1, 'cloud');
    room.vline(x + 1, top + 1, height - 1, 'silver');
    room.hline(x, top + height - 1, side, 'silver');
  }
  room.hline(left, top, width, 'gray');
}

export const RENTAL_STATES = ['empty', 'closed', 'occupied'];

// Returns the six sprites of a unit that people rent or buy, day and night each:
// `empty` is the bare room nobody has taken, `closed` is furnished, dark and curtained with
// nobody inside, `occupied` is lit with someone inside. `drawDay(state)` draws one.
export function rentalSprites(subject, { windows, drawDay }) {
  const sprites = [];
  for (const state of RENTAL_STATES) {
    const lit = drawDay(state);
    // A closed unit has its curtains drawn over the windows and its lights off, so even
    // by day its room is one step darker.
    const closed = state === 'closed';
    if (closed) {
      windows.forEach((window) => drawCurtains(lit, window));
    }
    const occupied = state === 'occupied';
    if (occupied) {
      windows.forEach((window) => drawOpenCurtains(lit, window));
    }
    const day = closed ? lightsOff(toNight(lit)) : lit;
    for (const time of TIMES) {
      const canvas = time === 'day' ? day : nightVersion(lit, closed ? [] : windows, occupied);
      if (occupied && time === 'night') {
        // Clearing the glass at night also cleared the curtains, so draw them again.
        windows.forEach((window) => drawOpenCurtains(canvas, window));
      }
      sprites.push({ id: `units/${subject}/${state}_${time}`, canvas });
    }
  }
  return sprites;
}
