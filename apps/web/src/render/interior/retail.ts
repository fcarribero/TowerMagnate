import type { InteriorKind, InteriorRoll, InteriorSpec } from './types';

/**
 * Retail shop: a 12 tile shop with no windows that sells one of four lines (clothes, books,
 * grocery, electronics). The seed picks the line as well as the furniture, so a new tenant can
 * open a different kind of shop. Each line has its own bare shop (sign colors, awning, walls)
 * and its own spec. Props are drawn by tools/art/src/groups/retail.mjs. Customers walk in as
 * people; no prop draws one.
 */

export type RetailState = 'empty' | 'closed' | 'open' | 'busy';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({ weight: 2, max: 1, ...entry });

const PROPS = {
  'cash-counter': kind({
    kind: 'cash-counter',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 18,
    height: 10,
    looks: BUSY,
    flip: true,
  }),
  'shop-poster': kind({
    kind: 'shop-poster',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 8,
    height: 7,
    max: 2,
  }),
  'plant-medium': kind({
    kind: 'plant-medium',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    flip: true,
  }),
  clock: kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
  // Clothes.
  'garment-rack': kind({
    kind: 'garment-rack',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 10,
    flip: true,
    weight: 3,
    max: 3,
  }),
  'dress-form': kind({
    kind: 'dress-form',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 3,
    height: 9,
    weight: 3,
    max: 3,
  }),
  'clothes-shelf': kind({
    kind: 'clothes-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 14,
    weight: 3,
    max: 3,
  }),
  'standing-mirror': kind({
    kind: 'standing-mirror',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 14,
  }),
  'display-table': kind({
    kind: 'display-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 7,
    max: 2,
  }),
  'shoe-rack': kind({
    kind: 'shoe-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 8,
    max: 2,
  }),
  // Books.
  bookcase: kind({
    kind: 'bookcase',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 14,
    weight: 4,
    max: 4,
  }),
  'book-table': kind({
    kind: 'book-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 8,
    weight: 3,
    max: 2,
  }),
  'reading-chair': kind({
    kind: 'reading-chair',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 8,
    height: 8,
    flip: true,
    max: 2,
  }),
  'magazine-rack': kind({
    kind: 'magazine-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 10,
  }),
  // Grocery.
  'grocer-shelf': kind({
    kind: 'grocer-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 14,
    weight: 4,
    max: 3,
  }),
  'produce-stand': kind({
    kind: 'produce-stand',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 11,
    height: 8,
    weight: 3,
    max: 2,
  }),
  'grocer-fridge': kind({
    kind: 'grocer-fridge',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 14,
    max: 2,
  }),
  'chest-freezer': kind({
    kind: 'chest-freezer',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 8,
  }),
  'bread-shelf': kind({
    kind: 'bread-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 10,
  }),
  baskets: kind({
    kind: 'baskets',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 6,
  }),
  'price-board': kind({
    kind: 'price-board',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 12,
    height: 7,
  }),
  // Electronics.
  'tv-stand': kind({
    kind: 'tv-stand',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 11,
    looks: BUSY,
    weight: 3,
    max: 3,
  }),
  'tv-wall': kind({
    kind: 'tv-wall',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 15,
    height: 6,
    looks: BUSY,
    weight: 3,
    max: 2,
  }),
  'computer-table': kind({
    kind: 'computer-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 9,
    looks: BUSY,
    max: 2,
  }),
  'phone-counter': kind({
    kind: 'phone-counter',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 8,
    looks: BUSY,
  }),
  speaker: kind({
    kind: 'speaker',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 10,
    max: 2,
  }),
  'box-shelf': kind({
    kind: 'box-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 12,
    max: 2,
  }),
} satisfies Record<string, InteriorKind>;

type RetailKind = keyof typeof PROPS;

const COMMON = {
  group: 'retail',
  room: { width: 96, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 16, wallTop: 13 },
  windows: [],
  zones: [{ id: 'room', left: 2, right: 93 }],
  states: ['empty', 'closed', 'open', 'busy'],
  // A shop nobody rents is bare.
  propLook: { empty: null, closed: 'idle', open: 'idle', busy: 'busy' },
  curtains: { empty: null, closed: null, open: null, busy: null },
  // An open shop keeps its lights on; an empty or closed one is dark at night.
  shade: {
    empty: { day: 0, night: 0.55 },
    closed: { day: 0, night: 0.55 },
    open: { day: 0, night: 0 },
    busy: { day: 0, night: 0 },
  },
} as const satisfies Partial<InteriorSpec<RetailState>>;

function line(
  name: string,
  subject: string,
  kinds: readonly RetailKind[],
  rolls: readonly InteriorRoll[],
): InteriorSpec<RetailState> {
  return {
    ...COMMON,
    unitType: subject,
    baseSprite: `units/${subject}/empty_day`,
    catalog: ['cash-counter', 'shop-poster', 'plant-medium', 'clock', ...kinds].map(
      (entry) => PROPS[entry as RetailKind],
    ),
    templates: [
      {
        id: 'random',
        name: 'Random',
        fixed: [],
        rolls: [{ kinds: ['cash-counter'], count: [1, 1] }, ...rolls],
      },
    ],
    overlays: { closed: [`retail/overlay/${name}-closed`] },
  };
}

const EXTRAS: InteriorRoll = { kinds: ['shop-poster', 'clock', 'plant-medium'], count: [0, 2] };

export const CLOTHES_SHOP_INTERIOR = line(
  'clothes',
  'retail-shop',
  ['garment-rack', 'dress-form', 'clothes-shelf', 'standing-mirror', 'display-table', 'shoe-rack'],
  [
    { kinds: ['garment-rack', 'dress-form', 'display-table'], count: [2, 4] },
    { kinds: ['clothes-shelf', 'standing-mirror', 'shoe-rack'], count: [2, 4] },
    EXTRAS,
  ],
);

export const BOOK_SHOP_INTERIOR = line(
  'books',
  'retail-shop-books',
  ['bookcase', 'book-table', 'reading-chair', 'magazine-rack'],
  [
    { kinds: ['bookcase', 'magazine-rack'], count: [3, 5] },
    { kinds: ['book-table', 'reading-chair'], count: [1, 3] },
    EXTRAS,
  ],
);

export const GROCERY_INTERIOR = line(
  'grocery',
  'retail-shop-grocery',
  [
    'grocer-shelf',
    'produce-stand',
    'grocer-fridge',
    'chest-freezer',
    'bread-shelf',
    'baskets',
    'price-board',
  ],
  [
    { kinds: ['grocer-shelf', 'grocer-fridge', 'bread-shelf'], count: [3, 5] },
    { kinds: ['produce-stand', 'chest-freezer', 'baskets'], count: [1, 3] },
    { kinds: ['price-board'], count: [0, 1] },
    EXTRAS,
  ],
);

export const ELECTRONICS_INTERIOR = line(
  'electronics',
  'retail-shop-electronics',
  ['tv-stand', 'tv-wall', 'computer-table', 'phone-counter', 'speaker', 'box-shelf'],
  [
    { kinds: ['tv-wall'], count: [1, 2] },
    { kinds: ['tv-stand', 'box-shelf', 'speaker'], count: [2, 4] },
    { kinds: ['computer-table', 'phone-counter'], count: [1, 2] },
    EXTRAS,
  ],
);

/** The four lines, in the order the seed picks them. */
export const RETAIL_LINES: readonly InteriorSpec<RetailState>[] = [
  CLOTHES_SHOP_INTERIOR,
  BOOK_SHOP_INTERIOR,
  GROCERY_INTERIOR,
  ELECTRONICS_INTERIOR,
];

/** The line a shop with this seed sells, from the seed's top two bits. */
export function retailLineOf(seed: number): InteriorSpec<RetailState> {
  return RETAIL_LINES[(seed >>> 30) & 3] as InteriorSpec<RetailState>;
}
