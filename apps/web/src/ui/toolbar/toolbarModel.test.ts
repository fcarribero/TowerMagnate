import {
  UNIT_CATALOG,
  UNIT_TYPES,
  type ToolbarCategory,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  TOOLBAR_CATEGORIES,
  fixedToolForKey,
  isLocked,
  lobbyHeights,
  priceText,
  sizeText,
  toolsInCategory,
  tooltipLines,
} from './toolbarModel';

type Row = readonly [unit: UnitType, size: string, price: string, stars: number];

// The table of docs/design/ui.md section 5.3.
const DESIGN_TABLE: Readonly<Record<ToolbarCategory, readonly Row[]>> = {
  structure: [
    ['floor', '1 x 1 casilleros', '$500 por casillero', 1],
    ['lobby', '1 x 1, 2 o 3 casilleros', '$5.000 por casillero', 1],
  ],
  transport: [
    ['stairs', '8 casilleros, une 2 pisos', '$5.000', 1],
    ['escalator', '8 casilleros, une 2 pisos', '$20.000', 1],
    ['standard-elevator', 'Hueco de 4, hasta 30 pisos', '$200.000 + $80.000 por cabina', 1],
    ['service-elevator', 'Hueco de 4, hasta 30 pisos', '$100.000 + $50.000 por cabina', 2],
    ['express-elevator', 'Hueco de 6', '$400.000 + $150.000 por cabina', 3],
  ],
  'offices-and-housing': [
    ['office', '9 x 1 casilleros', '$40.000', 1],
    ['condo', '16 x 1 casilleros', '$80.000', 1],
  ],
  hotel: [
    ['single-room', '4 x 1 casilleros', '$20.000', 2],
    ['double-room', '6 x 1 casilleros', '$50.000', 2],
    ['suite', '10 x 1 casilleros', '$100.000', 2],
    ['housekeeping', '15 x 1 casilleros', '$50.000', 2],
  ],
  'commerce-and-entertainment': [
    ['fast-food', '16 x 1 casilleros', '$100.000', 1],
    ['restaurant', '24 x 1 casilleros', '$200.000', 3],
    ['retail-shop', '12 x 1 casilleros', '$100.000', 3],
    ['cinema', '31 x 2 casilleros', '$500.000', 3],
    ['party-hall', '24 x 2 casilleros', '$100.000', 3],
  ],
  services: [
    ['security', '16 x 1 casilleros', '$100.000', 2],
    ['medical-center', '26 x 1 casilleros', '$500.000', 3],
    ['parking-ramp', '16 x 1 casilleros', '$50.000', 3],
    ['parking-space', '4 x 1 casilleros', '$3.000', 3],
    ['recycling-center', '25 x 2 casilleros', '$500.000', 3],
    ['subway-station', '30 x 3 casilleros', '$1.000.000', 4],
    ['cathedral', '28 x 4 casilleros', '$3.000.000', 5],
  ],
};

describe('toolbar categories', () => {
  it('follow the design order', () => {
    expect(TOOLBAR_CATEGORIES).toEqual(Object.keys(DESIGN_TABLE));
  });

  it.each(TOOLBAR_CATEGORIES)('%s lists its tools in the design order', (category) => {
    expect(toolsInCategory(category)).toEqual(DESIGN_TABLE[category].map(([unit]) => unit));
  });

  it('show every catalog unit exactly once', () => {
    const shown = TOOLBAR_CATEGORIES.flatMap(toolsInCategory);
    expect([...shown].sort()).toEqual([...UNIT_TYPES].sort());
  });
});

describe('tool texts', () => {
  const rows = Object.values(DESIGN_TABLE).flat();

  it.each(rows)(
    '%s prints size %s and price %s, unlocks at %i stars',
    (unit, size, price, stars) => {
      const definition = UNIT_CATALOG[unit];
      expect(sizeText(definition)).toBe(size);
      expect(priceText(definition)).toBe(price);
      expect(definition.unlockStars).toBe(stars);
    },
  );

  it('builds the tooltip as name and price, then size', () => {
    expect(tooltipLines('office', 1)).toEqual(['Oficina: $40.000', '9 x 1 casilleros']);
  });

  it('adds the unlock stars to a locked tool', () => {
    expect(tooltipLines('cathedral', 4)).toEqual([
      'Catedral: $3.000.000',
      '28 x 4 casilleros',
      'Se desbloquea con 5 estrellas',
    ]);
  });

  it('names fixed tools only', () => {
    expect(tooltipLines('bulldozer', 1)).toEqual(['Topadora']);
  });
});

describe('isLocked', () => {
  it('locks tools above the current rating', () => {
    expect(isLocked('suite', 1)).toBe(true);
    expect(isLocked('suite', 2)).toBe(false);
    expect(isLocked('cathedral', 6)).toBe(false);
  });

  it('never locks fixed tools', () => {
    expect(isLocked('inspect', 1)).toBe(false);
    expect(isLocked('car', 1)).toBe(false);
  });
});

describe('fixedToolForKey', () => {
  it('maps L, T and C in either case', () => {
    expect(fixedToolForKey('l')).toBe('inspect');
    expect(fixedToolForKey('T')).toBe('bulldozer');
    expect(fixedToolForKey('c')).toBe('car');
    expect(fixedToolForKey('x')).toBeNull();
  });

  it('maps Esc to the Lupa', () => {
    expect(fixedToolForKey('Escape')).toBe('inspect');
  });
});

describe('lobbyHeights', () => {
  it('offers 1, 2 and 3 floors', () => {
    expect(lobbyHeights()).toEqual([1, 2, 3]);
  });
});
