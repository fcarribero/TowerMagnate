import { PixelCanvas } from '../canvas.mjs';
import { metrics } from '../metrics.mjs';

const { frameWidth, frameHeight } = metrics.person;
const LOWER_BODY_TOP = 11;
const TORSO_LEFT = 1;
const TORSO_WIDTH = 5;
const HEAD_LEFT = 2;

// A tall build stands 14 px high, a short one 13 px with a belly pixel in front.
const BUILDS = {
  tall: { headTop: 2, belly: false },
  short: { headTop: 3, belly: true },
};

function layout(build) {
  const { headTop, belly } = BUILDS[build];
  return { headTop, torsoTop: headTop + 4, handRow: LOWER_BODY_TOP - 1, belly };
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

const POSES = ['walk_01', 'walk_02', 'stand'];
const TINTS = [
  { suffix: '', color: null },
  { suffix: '-pink', color: 'stress-pink' },
  { suffix: '-red', color: 'stress-red' },
];

function drawHead(person, { headTop }, look) {
  person.fillRect(HEAD_LEFT, headTop + 1, 3, 3, look.skin);
  person.hline(HEAD_LEFT, headTop, 3, look.hair);
  person.set(HEAD_LEFT, headTop + 1, look.hair);
}

function drawTorso(person, { torsoTop, handRow, belly }, look) {
  const rows = handRow - torsoTop + 1;
  person.fillRect(TORSO_LEFT, torsoTop, TORSO_WIDTH, rows, look.top);
  person.set(TORSO_LEFT, handRow, look.skin);
  person.set(TORSO_LEFT + TORSO_WIDTH - 1, handRow, look.skin);
  if (belly) {
    person.set(TORSO_LEFT + TORSO_WIDTH, torsoTop + 2, look.top);
  }
}

function drawLowerBody(person, look, pose) {
  const rows = LOWER_BODIES[look.lowerBody][pose];
  person.drawMap(0, LOWER_BODY_TOP, rows, { l: look.legs, k: 'ink' });
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
};

// Details on top of the base figure. Clothing details take the stress tint,
// the rest (badges, glasses, hats) keep their color.
const DETAILS = {
  collarAndTie(person, { torsoTop }, look) {
    person.set(2, torsoTop, 'cloud');
    person.set(4, torsoTop, 'cloud');
    person.vline(3, torsoTop, 3, look.accent);
  },
  shirtFront(person, { torsoTop }, look) {
    person.vline(3, torsoTop, 2, look.accent);
  },
  apron(person, { torsoTop, handRow }, look) {
    person.fillRect(2, torsoTop + 1, 3, handRow - torsoTop, look.accent);
    person.hline(2, LOWER_BODY_TOP, 3, look.accent);
  },
  maidCap(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'cloud');
    person.set(HEAD_LEFT + 1, headTop - 1, 'white');
  },
  guardCap(person, { headTop }) {
    person.hline(HEAD_LEFT, headTop, 3, 'ink');
    person.set(HEAD_LEFT + 3, headTop, 'ink');
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
};

function drawPerson(type, variant, pose, tint) {
  const outfit = type.outfits[variant.outfit];
  const look = tinted({ ...outfit, ...variant }, tint);
  const parts = layout(variant.build);
  const person = new PixelCanvas(frameWidth, frameHeight);
  drawLowerBody(person, look, pose);
  drawTorso(person, parts, look);
  drawHead(person, parts, look);
  for (const detail of outfit.details ?? type.details ?? []) {
    DETAILS[detail](person, parts, look);
  }
  if (type.prop) {
    PROPS[type.prop](person, parts);
  }
  return person;
}

// Stress recolors the clothes and keeps skin, hair, shoes and props.
function tinted(look, tint) {
  if (tint.color === null) {
    return look;
  }
  return { ...look, top: tint.color, legs: tint.color, accent: tint.color };
}

// Calm clothes stay dark so pink and red stand out.
const TYPES = {
  worker: {
    lowerBody: 'trousers',
    details: ['collarAndTie'],
    prop: 'briefcase',
    outfits: [
      { top: 'charcoal', legs: 'ink', accent: 'cloth-blue' },
      { top: 'cloth-blue', legs: 'night-deep', accent: 'charcoal' },
    ],
  },
  resident: {
    lowerBody: 'trousers',
    outfits: [
      { top: 'leaf-dark', legs: 'wood-dark' },
      { top: 'slate', legs: 'night' },
    ],
  },
  guest: {
    lowerBody: 'trousers',
    prop: 'suitcase',
    outfits: [
      { top: 'wood-dark', legs: 'charcoal' },
      { top: 'night', legs: 'ink' },
    ],
  },
  customer: {
    lowerBody: 'skirt',
    prop: 'shoppingBag',
    outfits: [
      { top: 'cloth-blue', legs: 'night' },
      { top: 'slate', legs: 'charcoal' },
    ],
  },
  maid: {
    lowerBody: 'skirt',
    details: ['apron', 'maidCap'],
    outfits: [
      { top: 'cloud', legs: 'cloud', accent: 'cloth-blue' },
      { top: 'cloud', legs: 'cloud', accent: 'night' },
    ],
  },
  security: {
    lowerBody: 'trousers',
    details: ['badgeAndBelt', 'guardCap'],
    outfits: [
      { top: 'cloth-blue', legs: 'ink' },
      { top: 'cloth-blue', legs: 'night-deep' },
    ],
  },
  vip: {
    lowerBody: 'trousers',
    details: ['shirtFront', 'sunglasses', 'lapelPin'],
    outfits: [
      { top: 'ink', legs: 'ink', accent: 'white' },
      { top: 'night-deep', legs: 'ink', accent: 'cloud' },
    ],
  },
  bride: {
    lowerBody: 'gown',
    details: ['veil'],
    prop: 'bouquet',
    outfits: [
      { top: 'white', legs: 'white' },
      { top: 'cloud', legs: 'cloud' },
    ],
  },
  // Outfit 0 is a suit and outfit 1 a dress, so the four variants are two suits and two dresses.
  'wedding-guest': {
    lowerBody: 'trousers',
    outfits: [
      {
        top: 'night-deep',
        legs: 'night-deep',
        accent: 'white',
        details: ['shirtFront', 'lapelPin'],
      },
      { top: 'cloth-red', legs: 'cloth-red', lowerBody: 'skirt', details: ['boutonniere'] },
    ],
  },
  groom: {
    lowerBody: 'trousers',
    details: ['shirtFront', 'boutonniere'],
    outfits: [
      { top: 'ink', legs: 'ink', accent: 'white' },
      { top: 'charcoal', legs: 'ink', accent: 'cloud' },
    ],
  },
};

// Two builds times two outfits, each with its own skin and hair.
const VARIANTS = {
  a: { build: 'tall', outfit: 0, skin: 'skin-light', hair: 'wood-dark' },
  b: { build: 'short', outfit: 1, skin: 'skin-dark', hair: 'ink' },
  c: { build: 'tall', outfit: 1, skin: 'skin-mid', hair: 'charcoal' },
  d: { build: 'short', outfit: 0, skin: 'skin-mid', hair: 'slate' },
};

export const PERSON_TYPES = Object.keys(TYPES);
export const PERSON_VARIANTS = Object.keys(VARIANTS);

function poseId(pose, tint) {
  const [action, frame] = pose.split('_');
  const state = `${action}${tint.suffix}`;
  return frame === undefined ? state : `${state}_${frame}`;
}

function variantOf(type, variantName) {
  const variant = VARIANTS[variantName];
  const lowerBody = type.outfits[variant.outfit].lowerBody ?? type.lowerBody;
  return { ...variant, lowerBody };
}

// A calm person in one pose, for sprites that combine people.
export function drawCalmPerson(typeName, variantName, pose) {
  const type = TYPES[typeName];
  return drawPerson(type, variantOf(type, variantName), pose, TINTS[0]);
}

function personSprites(typeName, variantName) {
  const type = TYPES[typeName];
  const variant = variantOf(type, variantName);
  return TINTS.flatMap((tint) =>
    POSES.map((pose) => ({
      id: `people/${typeName}-${variantName}/${poseId(pose, tint)}`,
      canvas: drawPerson(type, variant, pose, tint),
    })),
  );
}

export const peopleGroup = {
  name: 'people',
  draw() {
    return PERSON_TYPES.flatMap((typeName) =>
      PERSON_VARIANTS.flatMap((variantName) => personSprites(typeName, variantName)),
    );
  },
};
