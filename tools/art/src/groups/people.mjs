import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

const { frameWidth, frameHeight } = metrics.person;
const LOWER_BODY_TOP = 11;
const TORSO_LEFT = 1;
const TORSO_WIDTH = 5;
const HEAD_LEFT = 2;
const HEAD_TOP = 2;

// There is one body shape per model. The client stretches it for height and build.
const MODELS = ['man', 'woman'];

function layout(dip = 0) {
  return {
    headTop: HEAD_TOP + dip,
    torsoTop: HEAD_TOP + dip + 4,
    handRow: LOWER_BODY_TOP - 1,
  };
}

// Lower bodies from row 11 down to the feet on row 15, facing right.
// l is the trousers or skirt color, k the shoes or stockings.
const LOWER_BODIES = {
  trousers: {
    stand: ['..lll...', '..l.l...', '..l.l...', '..l.l...', '..k.k...'],
    walk_01: ['..lll...', '.ll.ll..', '.l...l..', '.l...l..', '.k...kk.'],
    walk_02: ['..lll...', '..lll...', '..ll....', '..ll....', '..kkk...'],
  },
  skirt: {
    stand: ['.lllll..', '.lllll..', '..k.k...', '..k.k...', '..k.k...'],
    walk_01: ['.lllll..', '.lllll..', '.k...k..', '.k...k..', '.k...kk.'],
    walk_02: ['.lllll..', '.lllll..', '..kk....', '..kk....', '..kkk...'],
  },
  gown: {
    stand: ['.lllll..', '.lllll..', '.lllll..', 'lllllll.', 'lllllll.'],
    walk_01: ['.lllll..', '.llllll.', '.llllll.', 'lllllll.', 'llllllk.'],
    walk_02: ['.lllll..', '.lllll..', 'llllll..', 'lllllll.', 'lllllll.'],
  },
};
const LOWERS = Object.keys(LOWER_BODIES);

// idle_01 and idle_02 loop while a person stands: the second frame lowers the head and shoulders by
// one pixel, a slow breath.
const POSES = ['walk_01', 'walk_02', 'stand', 'idle_01', 'idle_02'];

// Recolorable regions are drawn in white with cloud as the one shade, so the client multiplies each
// layer by a runtime color. Skin, hair, shirt and trousers or skirt are separate layers. Shoes,
// uniform parts and props are drawn in their own colors in the fixed layer.
const BASE = 'white';
const SHADE = 'cloud';

function drawHair(model, { headTop }) {
  const layer = new PixelCanvas(frameWidth, frameHeight);
  layer.hline(HEAD_LEFT, headTop, 3, BASE);
  layer.set(HEAD_LEFT, headTop + 1, BASE);
  if (model === 'woman') {
    // Long hair falls behind the head onto the shoulders.
    layer.set(HEAD_LEFT, headTop + 2, SHADE);
    layer.vline(HEAD_LEFT - 1, headTop + 1, 4, BASE);
  }
  return layer;
}

// The head and hands, without the pixels the hair covers, so the two layers never overlap.
function drawSkin(model, { headTop, handRow }) {
  const layer = new PixelCanvas(frameWidth, frameHeight);
  layer.fillRect(HEAD_LEFT, headTop + 1, 3, 3, BASE);
  layer.hline(HEAD_LEFT, headTop + 3, 3, SHADE);
  layer.set(TORSO_LEFT, handRow, BASE);
  layer.set(TORSO_LEFT + TORSO_WIDTH - 1, handRow, BASE);
  const hair = drawHair(model, { headTop });
  hair.pixels.forEach((pixel, index) => {
    if (pixel !== 0) {
      layer.pixels[index] = 0;
    }
  });
  return layer;
}

function drawShirt({ torsoTop, handRow }) {
  const layer = new PixelCanvas(frameWidth, frameHeight);
  const rows = handRow - torsoTop + 1;
  layer.fillRect(TORSO_LEFT, torsoTop, TORSO_WIDTH, rows, BASE);
  layer.vline(TORSO_LEFT, torsoTop, rows, SHADE);
  return layer;
}

function lowerPose(pose) {
  return pose.startsWith('idle') ? 'stand' : pose;
}

function drawPants(lower, pose) {
  const layer = new PixelCanvas(frameWidth, frameHeight);
  layer.drawMap(0, LOWER_BODY_TOP, LOWER_BODIES[lower][lowerPose(pose)], { l: BASE });
  return layer;
}

function partsOf(pose) {
  return layout(pose === 'idle_02' ? 1 : 0);
}

// Small things carried in the front hand, beside the body.
const PROPS = {
  briefcase(person, { handRow }) {
    person.set(6, handRow, 'wood-dark');
    person.fillRect(5, handRow + 1, 3, 2, 'wood');
    person.hline(5, handRow + 2, 3, 'wood-dark');
  },
  suitcase(person, { handRow }) {
    person.set(6, handRow, 'gray');
    person.fillRect(6, handRow + 1, 2, 3, 'silver');
    person.vline(7, handRow + 1, 3, 'gray');
  },
  shoppingBag(person, { handRow }) {
    person.set(6, handRow - 1, 'wood');
    person.fillRect(6, handRow, 2, 3, 'wood-light');
    person.set(7, handRow + 2, 'wood');
  },
  bouquet(person, { handRow }) {
    person.set(6, handRow - 1, 'white');
    person.set(5, handRow - 1, 'lamp-glow');
    person.set(6, handRow, 'leaf');
    person.set(6, handRow + 1, 'leaf-dark');
  },
  // A black garbage bag hanging from the hand: tied neck, round body with a gray shine so it
  // still reads against dark interiors.
  trashBag(person, { handRow }) {
    person.set(6, handRow, 'slate');
    person.fillRect(5, handRow + 1, 3, 3, 'ink');
    person.set(5, handRow + 1, 'slate');
    person.set(7, handRow + 3, 'charcoal');
  },
};

// Uniform parts and accessories over the body. `accent` is the type's own color for them.
const DETAILS = {
  collarAndTie(person, { torsoTop }, accent) {
    person.set(2, torsoTop, 'cloud');
    person.set(4, torsoTop, 'cloud');
    person.vline(3, torsoTop, 3, accent);
  },
  shirtFront(person, { torsoTop }, accent) {
    person.vline(3, torsoTop, 2, accent);
  },
  apron(person, { torsoTop, handRow }, accent) {
    person.fillRect(2, torsoTop + 1, 3, handRow - torsoTop, accent);
    person.hline(2, LOWER_BODY_TOP, 3, accent);
  },
  maidCap(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'cloud');
    person.set(HEAD_LEFT + 1, headTop - 1, 'white');
  },
  guardCap(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'ink');
    person.set(HEAD_LEFT + 3, headTop, 'ink');
  },
  hardHat(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 4, 'lamp');
    person.set(HEAD_LEFT + 1, headTop - 1, 'lamp');
    person.set(HEAD_LEFT + 2, headTop - 1, 'lamp');
  },
  vestStripe(person, { torsoTop }) {
    person.hline(2, torsoTop + 1, 3, 'lamp');
  },
  badgeAndBelt(person, { torsoTop, handRow }) {
    person.set(2, torsoTop + 1, 'lamp');
    person.hline(2, handRow, 3, 'ink');
  },
  sunglasses(person, { headTop }) {
    person.hline(HEAD_LEFT + 1, headTop + 2, 2, 'ink');
  },
  lapelPin(person, { torsoTop }) {
    person.set(2, torsoTop + 1, 'lamp');
  },
  veil(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'white');
    person.set(HEAD_LEFT + 1, headTop - 1, 'white');
    person.vline(HEAD_LEFT - 1, headTop, 4, 'cloud');
  },
  boutonniere(person, { torsoTop }) {
    person.set(2, torsoTop + 1, 'white');
  },
  serviceCap(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'cloth-red');
    person.set(HEAD_LEFT + 3, headTop, 'cloth-red');
  },
};

// Types with a uniform or props. The client picks the clothes colors: a free palette for civilians
// and fixed colors for uniforms. Only the parts that never change color are drawn here.
// `models` limits who can wear the type and `lower` replaces trousers or skirt.
const TYPES = {
  worker: { details: ['collarAndTie'], accent: 'ink', prop: 'briefcase' },
  resident: {},
  guest: { prop: 'suitcase' },
  customer: { prop: 'shoppingBag' },
  maid: { models: ['woman'], details: ['apron', 'maidCap'], accent: 'cloth-blue' },
  security: { details: ['badgeAndBelt', 'guardCap'] },
  vip: { details: ['shirtFront', 'sunglasses', 'lapelPin'], accent: 'white' },
  bride: { models: ['woman'], lower: 'gown', details: ['veil'], prop: 'bouquet' },
  'wedding-guest': {
    modelDetails: { man: ['shirtFront', 'lapelPin'], woman: ['boutonniere'] },
    accent: 'white',
  },
  groom: { models: ['man'], details: ['shirtFront', 'boutonniere'], accent: 'white' },
  builder: { details: ['hardHat', 'vestStripe'] },
  staff: { details: ['apron', 'serviceCap'], accent: 'wood' },
  // The same crew carrying a garbage bag out of the building.
  staffbag: { details: ['apron', 'serviceCap'], accent: 'wood', prop: 'trashBag' },
};

export const PERSON_TYPES = Object.keys(TYPES);
export const PERSON_MODELS = MODELS;
export const PERSON_POSES = POSES;

function modelsOf(type) {
  return type.models ?? MODELS;
}

// The models that can wear a person type, by type name.
export function modelsOfType(typeName) {
  return modelsOf(TYPES[typeName]);
}

function lowerOf(type, model) {
  return type.lower ?? (model === 'man' ? 'trousers' : 'skirt');
}

function drawFixed(type, model, pose) {
  const parts = partsOf(pose);
  const layer = new PixelCanvas(frameWidth, frameHeight);
  const rows = LOWER_BODIES[lowerOf(type, model)][lowerPose(pose)];
  layer.drawMap(0, LOWER_BODY_TOP, rows, { k: 'ink' });
  const details = type.modelDetails?.[model] ?? type.details ?? [];
  for (const detail of details) {
    DETAILS[detail](layer, parts, type.accent ?? 'ink');
  }
  if (type.prop) {
    PROPS[type.prop](layer, parts);
  }
  return layer;
}

// A person with every layer in palette colors: `colors` has the base and shade palette ids of
// pants, shirt, skin and hair. For sprites that combine people and for preview sheets.
export function drawStyledPerson(typeName, model, pose, colors) {
  const type = TYPES[typeName];
  const parts = partsOf(pose);
  const layers = {
    pants: drawPants(lowerOf(type, model), pose),
    shirt: drawShirt(parts),
    skin: drawSkin(model, parts),
    hair: drawHair(model, parts),
  };
  const person = new PixelCanvas(frameWidth, frameHeight);
  for (const name of Object.keys(layers)) {
    const [base, shade] = colors[name];
    person.stamp(layers[name].recolor({ [BASE]: base, [SHADE]: shade }), 0, 0);
  }
  person.stamp(drawFixed(type, model, pose), 0, 0);
  return person;
}

const CALM_LOOKS = {
  bride: {
    model: 'woman',
    colors: {
      pants: ['white', 'cloud'],
      shirt: ['white', 'cloud'],
      skin: ['skin-light', 'skin-mid'],
      hair: ['wood-dark', 'wood-dark'],
    },
  },
  groom: {
    model: 'man',
    colors: {
      pants: ['ink', 'ink'],
      shirt: ['charcoal', 'ink'],
      skin: ['skin-mid', 'skin-dark'],
      hair: ['charcoal', 'charcoal'],
    },
  },
};

// The bride or groom in one pose, for sprites that combine people.
export function drawCalmPerson(typeName, pose) {
  const { model, colors } = CALM_LOOKS[typeName];
  return drawStyledPerson(typeName, model, pose, colors);
}

function poseId(pose) {
  const [action, frame] = pose.split('_');
  return frame === undefined ? action : `${action}_${frame}`;
}

function bodySprites() {
  return POSES.flatMap((pose) => {
    const parts = partsOf(pose);
    const id = poseId(pose);
    return [
      ...LOWERS.map((lower) => ({
        id: `people/pants-${lower}/${id}`,
        canvas: drawPants(lower, pose),
      })),
      ...MODELS.flatMap((model) => [
        { id: `people/shirt-${model}/${id}`, canvas: drawShirt(parts) },
        { id: `people/skin-${model}/${id}`, canvas: drawSkin(model, parts) },
        { id: `people/hair-${model}/${id}`, canvas: drawHair(model, parts) },
      ]),
    ];
  });
}

function fixedSprites() {
  return Object.entries(TYPES).flatMap(([typeName, type]) =>
    modelsOf(type).flatMap((model) =>
      POSES.map((pose) => ({
        id: `people/fixed-${typeName}-${model}/${poseId(pose)}`,
        canvas: drawFixed(type, model, pose),
      })),
    ),
  );
}

export const peopleGroup = {
  name: 'people',
  draw() {
    return [...bodySprites(), ...fixedSprites()];
  },
};
