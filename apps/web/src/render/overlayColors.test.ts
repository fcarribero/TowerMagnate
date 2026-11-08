import type { OverlayData, UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { overlayColorOf } from './overlayColors';

function unit(type: UnitView['type'], id = 'u1'): UnitView {
  return {
    id,
    type,
    x: 0,
    level: 1,
    name: null,
    price: 'normal',
    occupied: false,
    variant: 'empty',
  } as UnitView;
}

const data: OverlayData = {
  evaluation: { u1: 'good', u2: 'fair', u3: 'poor', u4: null },
  price: { u1: 'high', u2: 'normal', u3: 'low', u4: 'minimum' },
  hotel: { u1: 'clean', u2: 'occupied', u3: 'dirty', u4: 'infested' },
};

describe('overlayColorOf', () => {
  it('draws everything normally in the normal overlay', () => {
    expect(overlayColorOf('normal', unit('office'), data)).toBeNull();
  });

  it('colors evaluation values and shows gray without one', () => {
    const colors = ['u1', 'u2', 'u3', 'u4'].map((id) =>
      overlayColorOf('evaluation', unit('office', id), data),
    );
    expect(colors).toEqual(['sky-deep', 'lamp', 'cloth-red', 'gray']);
  });

  it('gives a unit missing from the evaluation data the gray', () => {
    expect(overlayColorOf('evaluation', unit('condo', 'u9'), data)).toBe('gray');
  });

  it('colors price levels', () => {
    const colors = ['u1', 'u2', 'u3', 'u4'].map((id) =>
      overlayColorOf('price', unit('retail-shop', id), data),
    );
    expect(colors).toEqual(['cloth-red', 'leaf', 'sky-deep', 'lamp']);
  });

  it('colors hotel room states', () => {
    const colors = ['u1', 'u2', 'u3', 'u4'].map((id) =>
      overlayColorOf('hotel', unit('suite', id), data),
    );
    expect(colors).toEqual(['leaf', 'sky-deep', 'dusk', 'cloth-red']);
  });

  it('gives units outside the overlay a charcoal checker', () => {
    expect(overlayColorOf('hotel', unit('office'), data)).toBe('charcoal');
    expect(overlayColorOf('price', unit('cinema'), data)).toBe('charcoal');
    expect(overlayColorOf('evaluation', unit('stairs'), data)).toBe('charcoal');
  });
});
