import type { ClientEvent } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { incomeFloaters, type FloaterSpace } from './incomeEvents';

const OFFICE = 'unit-1';

function income(amount: number, unitId: string | null): ClientEvent {
  return { type: 'moneyChanged', step: 1, amount, reason: 'rent', unitId } as ClientEvent;
}

const space: FloaterSpace = {
  unitRect: (id) => (id === OFFICE ? { x: 100, y: 200, width: 40, height: 20 } : null),
  cssPerDevicePixel: 0.5,
  canvasOrigin: { x: 10, y: 5 },
};

describe('incomeFloaters', () => {
  it('shows the amount over the top centre of a visible unit', () => {
    expect(incomeFloaters([income(25000, OFFICE)], space)).toEqual([
      { text: '+$25.000', x: 10 + 120 * 0.5, y: 5 + 100 },
    ]);
  });

  it('skips a unit that is off screen', () => {
    expect(incomeFloaters([income(25000, 'unit-9')], space)).toEqual([]);
  });

  it('skips income without a unit, zero amounts and expenses', () => {
    const events = [income(500, null), income(0, OFFICE), income(-300, OFFICE)];
    expect(incomeFloaters(events, space)).toEqual([]);
  });

  it('shows one floater per income', () => {
    expect(incomeFloaters([income(100, OFFICE), income(200, OFFICE)], space)).toHaveLength(2);
  });
});
