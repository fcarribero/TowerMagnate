import { PixelCanvas } from '../canvas.mjs';
import { parkingDisconnectedOverlay } from '../units/services.mjs';
import { propSprites } from './office.mjs';

// The vehicles a parking space can hold, seen from the front (the nose toward the camera),
// placed by the client on the bare space (units/parking-space/empty_day). Each one is a prop
// kind `car-00` to `car-99` with one look; the space rolls one when someone takes it. The
// vehicles' own lights are off. Every sprite is VEHICLE_WIDTH by VEHICLE_HEIGHT with the
// vehicle centered at the bottom, so the client puts all of them at the same spot.
// The sizes here must match apps/web/src/render/interior/parking.ts.

export const VEHICLE_COUNT = 100;
export const VEHICLE_WIDTH = 22;
export const VEHICLE_HEIGHT = 16;

/** Paint jobs: body, shade (edges) and light (the hood highlight). */
const PAINTS = [
  ['cloth-red', 'wood-dark', 'dusk'],
  ['cloth-blue', 'night', 'sky-deep'],
  ['sky-deep', 'cloth-blue', 'sky'],
  ['sky', 'sky-deep', 'sky-light'],
  ['white', 'cloud', 'white'],
  ['cloud', 'silver', 'white'],
  ['silver', 'gray', 'cloud'],
  ['gray', 'slate', 'silver'],
  ['slate', 'charcoal', 'gray'],
  ['charcoal', 'ink', 'slate'],
  ['leaf', 'leaf-dark', 'leaf'],
  ['leaf-dark', 'ink', 'leaf'],
  ['lamp', 'wood-light', 'lamp-glow'],
  ['dusk', 'wood', 'lamp'],
  ['wood', 'wood-dark', 'wood-light'],
  ['concrete-light', 'concrete', 'cloud'],
  ['night', 'night-deep', 'cloth-blue'],
  ['wood-dark', 'ink', 'wood'],
];

/**
 * Body shapes, rows from the top: roof, windshield, hood, face (lights and grille), bumper
 * and wheels. `cabinInset` narrows the cabin against the body.
 */
const CARS = {
  compact: { width: 14, roof: 1, glass: 3, hood: 1, face: 3, bumper: 1, wheels: 2, cabinInset: 1 },
  hatchback: {
    width: 14,
    roof: 1,
    glass: 4,
    hood: 1,
    face: 3,
    bumper: 1,
    wheels: 2,
    cabinInset: 1,
  },
  sedan: { width: 16, roof: 1, glass: 3, hood: 1, face: 3, bumper: 1, wheels: 2, cabinInset: 2 },
  coupe: { width: 16, roof: 1, glass: 2, hood: 1, face: 3, bumper: 1, wheels: 2, cabinInset: 3 },
  suv: { width: 18, roof: 1, glass: 4, hood: 1, face: 4, bumper: 1, wheels: 2, cabinInset: 1 },
  jeep: { width: 18, roof: 1, glass: 3, hood: 1, face: 4, bumper: 1, wheels: 3, cabinInset: 1 },
  pickup: { width: 18, roof: 1, glass: 3, hood: 1, face: 4, bumper: 2, wheels: 2, cabinInset: 2 },
  van: { width: 18, roof: 2, glass: 5, hood: 1, face: 3, bumper: 1, wheels: 2, cabinInset: 0 },
  truck: {
    width: 20,
    roof: 1,
    glass: 3,
    hood: 0,
    face: 4,
    bumper: 1,
    wheels: 2,
    cabinInset: 0,
    box: 4,
  },
  taxi: {
    width: 16,
    roof: 1,
    glass: 3,
    hood: 1,
    face: 3,
    bumper: 1,
    wheels: 2,
    cabinInset: 2,
    sign: true,
  },
};
const TYPES = [...Object.keys(CARS), 'motorbike', 'scooter'];
const LIGHTS = ['round', 'rect', 'slim', 'twin'];
const GRILLES = ['bars', 'mesh', 'slot', 'split'];
const BUMPERS = ['charcoal', 'silver', 'body'];
const EXTRAS = ['none', 'none', 'rack', 'antenna'];

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

/** The headlight on one side, unlit, `x` its outer column. */
function headlight(canvas, x, y, style, side) {
  const step = side === 'left' ? 1 : -1;
  const put = (dx, dy, color) => canvas.set(x + dx * step, y + dy, color);
  if (style === 'round') {
    put(1, 0, 'cloud');
    put(2, 0, 'cloud');
    put(1, 1, 'silver');
    put(2, 1, 'cloud');
  } else if (style === 'rect') {
    put(1, 0, 'white');
    put(2, 0, 'cloud');
    put(3, 0, 'cloud');
  } else if (style === 'slim') {
    for (let dx = 1; dx <= 4; dx++) put(dx, 0, dx === 1 ? 'white' : 'silver');
  } else {
    put(1, 0, 'cloud');
    put(3, 0, 'cloud');
    put(1, 1, 'dusk');
  }
}

function grille(canvas, left, top, width, height, style) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = 'charcoal';
      if (style === 'bars') color = y % 2 === 0 ? 'charcoal' : 'slate';
      if (style === 'mesh') color = (x + y) % 2 === 0 ? 'charcoal' : 'gray';
      if (style === 'slot' && y > 0) continue;
      if (style === 'split' && x === Math.floor(width / 2) - 1) color = 'silver';
      if (style === 'split' && x === Math.floor(width / 2)) color = 'silver';
      canvas.set(left + x, top + y, color);
    }
  }
  canvas.set(left + Math.floor(width / 2), top, 'silver');
}

function drawCar(look) {
  const shape = CARS[look.type];
  const [body, shade, light] = look.paint;
  const canvas = new PixelCanvas(VEHICLE_WIDTH, VEHICLE_HEIGHT);
  const left = (VEHICLE_WIDTH - shape.width) / 2;
  const right = left + shape.width - 1;
  let y = VEHICLE_HEIGHT - 1;

  // Wheels and the dark underbody between them.
  for (let row = 0; row < shape.wheels; row++, y--) {
    canvas.hline(left, y, 3, 'ink');
    canvas.hline(right - 2, y, 3, 'ink');
    if (row === shape.wheels - 1) canvas.hline(left + 3, y, shape.width - 6, 'charcoal');
  }
  // Bumper.
  const bumper = look.bumper === 'body' ? shade : look.bumper;
  for (let row = 0; row < shape.bumper; row++, y--) canvas.hline(left, y, shape.width, bumper);
  // Face: lights at the top, grille in the middle, the plate below it.
  const faceTop = y - shape.face + 1;
  canvas.fillRect(left, faceTop, shape.width, shape.face, body);
  canvas.vline(left, faceTop, shape.face, shade);
  canvas.vline(right, faceTop, shape.face, shade);
  headlight(canvas, left, faceTop, look.lights, 'left');
  headlight(canvas, right, faceTop, look.lights, 'right');
  const grilleWidth = shape.width - 10;
  grille(canvas, left + 5, faceTop, grilleWidth, shape.face - 1, look.grille);
  const plateLeft = left + shape.width / 2 - 2;
  canvas.hline(plateLeft, y, 4, 'white');
  canvas.set(plateLeft + 1, y, 'ink');
  y = faceTop - 1;
  // Hood.
  for (let row = 0; row < shape.hood; row++, y--) {
    canvas.hline(left + 1, y, shape.width - 2, light);
    canvas.set(left, y, shade);
    canvas.set(right, y, shade);
  }
  // Cabin: pillars around the windshield, mirrors at its foot.
  const cabinLeft = left + shape.cabinInset;
  const cabinWidth = shape.width - shape.cabinInset * 2;
  for (let row = 0; row < shape.glass; row++, y--) {
    const narrow = row === shape.glass - 1 && shape.cabinInset > 0 ? 1 : 0;
    canvas.hline(cabinLeft + narrow, y, cabinWidth - narrow * 2, body);
    canvas.hline(cabinLeft + 1 + narrow, y, cabinWidth - 2 - narrow * 2, 'glass');
    if (row === 0) {
      canvas.set(cabinLeft - 1, y, shade);
      canvas.set(cabinLeft + cabinWidth, y, shade);
    }
  }
  const glassTop = y + 1;
  canvas.set(cabinLeft + 2, glassTop + 1, 'sky-light');
  canvas.set(cabinLeft + 3, glassTop + 1, 'sky-light');
  // Roof.
  for (let row = 0; row < shape.roof; row++, y--) {
    canvas.hline(cabinLeft + 1, y, cabinWidth - 2, row === shape.roof - 1 ? light : body);
  }
  if (shape.box) {
    // A cargo box over the cab, as wide as the truck.
    const top = y - shape.box + 1;
    canvas.fillRect(left, top, shape.width, shape.box, 'white');
    canvas.hline(left, top, shape.width, 'cloud');
    canvas.vline(left, top, shape.box, 'cloud');
    canvas.vline(right, top, shape.box, 'silver');
    canvas.hline(left + 3, top + 2, shape.width - 6, body);
    y = top - 1;
  }
  if (shape.sign) {
    canvas.hline(left + shape.width / 2 - 2, y, 4, 'lamp-glow');
    canvas.hline(left + shape.width / 2 - 2, y - 1, 4, 'ink');
    canvas.set(left + shape.width / 2 - 1, y - 1, 'lamp');
  } else if (look.extra === 'rack' && !shape.box) {
    canvas.hline(cabinLeft + 1, y, cabinWidth - 2, 'charcoal');
  } else if (look.extra === 'antenna' && !shape.box) {
    canvas.vline(cabinLeft + cabinWidth - 2, y - 2, 3, 'slate');
  }
  return canvas;
}

// A motorbike or a scooter from the front, with nobody on it.
function drawBike(look) {
  const [body, shade, light] = look.paint;
  const canvas = new PixelCanvas(VEHICLE_WIDTH, VEHICLE_HEIGHT);
  const center = VEHICLE_WIDTH / 2;
  if (look.type === 'motorbike') {
    canvas.fillRect(center - 1, 11, 2, 5, 'ink');
    canvas.hline(center - 2, 10, 4, body);
    canvas.vline(center - 2, 7, 3, 'silver');
    canvas.vline(center + 1, 7, 3, 'silver');
    canvas.fillRect(center - 3, 3, 6, 4, body);
    canvas.vline(center - 3, 3, 4, shade);
    canvas.hline(center - 2, 2, 4, light);
    canvas.fillRect(center - 2, 0, 4, 2, 'glass');
    canvas.fillRect(center - 1, 4, 2, 2, look.lights === 'slim' ? 'silver' : 'cloud');
    canvas.hline(center - 5, 5, 10, 'charcoal');
    canvas.set(center - 5, 3, 'ink');
    canvas.set(center - 5, 4, 'charcoal');
    canvas.set(center + 4, 3, 'ink');
    canvas.set(center + 4, 4, 'charcoal');
  } else {
    canvas.fillRect(center - 1, 13, 2, 3, 'ink');
    canvas.fillRect(center - 3, 6, 6, 7, body);
    canvas.vline(center - 3, 6, 7, shade);
    canvas.vline(center + 2, 6, 7, shade);
    canvas.hline(center - 2, 6, 4, light);
    canvas.hline(center - 4, 4, 8, 'charcoal');
    canvas.fillRect(center - 1, 3, 2, 2, look.lights === 'slim' ? 'silver' : 'cloud');
    canvas.set(center - 4, 2, 'ink');
    canvas.set(center - 4, 3, 'charcoal');
    canvas.set(center + 3, 2, 'ink');
    canvas.set(center + 3, 3, 'charcoal');
    canvas.hline(center - 1, 11, 2, 'white');
  }
  return canvas;
}

/** The hundred vehicles, every one different, the types taken in turn. */
export function vehicleLooks() {
  const random = seeded(20261119);
  const looks = [];
  const keys = new Set();
  for (let index = 0; looks.length < VEHICLE_COUNT; index++) {
    const type = TYPES[index % TYPES.length];
    const look = {
      type,
      paint: type === 'taxi' ? PAINTS[12] : pick(random, PAINTS),
      lights: pick(random, LIGHTS),
      grille: pick(random, GRILLES),
      bumper: pick(random, BUMPERS),
      extra: pick(random, EXTRAS),
    };
    const bike = type === 'motorbike' || type === 'scooter';
    const key = bike
      ? `${type}|${look.paint[0]}|${look.lights === 'slim'}`
      : `${type}|${look.paint[0]}|${look.lights}|${look.grille}|${look.bumper}|${look.extra}`;
    if (keys.has(key)) continue;
    keys.add(key);
    looks.push(look);
  }
  return looks;
}

export function vehicleKind(index) {
  return `car-${String(index).padStart(2, '0')}`;
}

export function parkingProps() {
  return Object.fromEntries(
    vehicleLooks().map((look, index) => {
      const bike = look.type === 'motorbike' || look.type === 'scooter';
      return [vehicleKind(index), { idle: bike ? drawBike(look) : drawCar(look) }];
    }),
  );
}

export const parkingGroup = {
  name: 'parking',
  draw() {
    return propSprites(
      'parking',
      parkingProps(),
      [],
      [{ id: 'parking/overlay/disconnected', canvas: parkingDisconnectedOverlay() }],
    );
  },
};
